"use client";

import { useState, useEffect, useCallback } from "react";
import {
  MiniKit,
  VerificationLevel,
} from "@worldcoin/minikit-js";
import FaucetABI from "@/abi/MXCFaucetV2.json";

const FAUCET_ADDRESS = process.env.NEXT_PUBLIC_FAUCET_ADDRESS || "0x0B58Ee4c648A3AB547d059F890015802536579EE";
const APP_ID = process.env.NEXT_PUBLIC_APP_ID || "app_34eda6ef2b7ca54ef9e44cbde3a7652e";
const ACTION_ID = "claim-daily-mxc";
const USDC_ADDRESS = "0x79A02482A880bCE3F13e09Da970dC34db4CD24d1";
const MXC_PER_USDC = 500;

// ABI mínimo de USDC para transfer
const USDC_ABI = [
  {
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    name: "transfer",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
];

type Status = { type: "success" | "error" | "loading"; message: string } | null;

export default function Home() {
  const [isInstalled, setIsInstalled] = useState(false);
  const [activeTab, setActiveTab] = useState<"claim" | "buy">("claim");
  const [usdcAmount, setUsdcAmount] = useState("");
  const [estimatedMXC, setEstimatedMXC] = useState("0");
  const [claimStatus, setClaimStatus] = useState<Status>(null);
  const [buyStatus, setBuyStatus] = useState<Status>(null);
  const [isClaiming, setIsClaiming] = useState(false);
  const [isBuying, setIsBuying] = useState(false);

  useEffect(() => {
    setIsInstalled(MiniKit.isInstalled());
  }, []);

  // Estimate MXC for USDC amount
  useEffect(() => {
    if (!usdcAmount || parseFloat(usdcAmount) <= 0) {
      setEstimatedMXC("0");
      return;
    }
    const mxc = parseFloat(usdcAmount) * MXC_PER_USDC;
    setEstimatedMXC(mxc.toLocaleString("es-MX"));
  }, [usdcAmount]);

  // === CLAIM DAILY MXC ===
  const handleClaim = useCallback(async () => {
    if (!MiniKit.isInstalled()) {
      setClaimStatus({ type: "error", message: "Abre la app desde World App" });
      return;
    }

    setIsClaiming(true);
    setClaimStatus({ type: "loading", message: "Verificando identidad..." });

    try {
      const { finalPayload } = await MiniKit.commandsAsync.verify({
        action: ACTION_ID,
        verification_level: VerificationLevel.Orb,
      });

      if (finalPayload.status === "error") {
        setClaimStatus({ type: "error", message: "Verificación cancelada" });
        setIsClaiming(false);
        return;
      }

      setClaimStatus({ type: "loading", message: "Verificando proof..." });

      const verifyRes = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payload: finalPayload,
          action: ACTION_ID,
        }),
      });

      const verifyData = await verifyRes.json();

      if (verifyData.status !== 200) {
        setClaimStatus({ type: "error", message: "Proof inválido o ya reclamaste hoy" });
        setIsClaiming(false);
        return;
      }

      setClaimStatus({ type: "loading", message: "Enviando transacción..." });

      const proof = finalPayload as unknown as {
        nullifier_hash: string;
        merkle_root: string;
        proof: string;
      };

      const { finalPayload: txPayload } = await MiniKit.commandsAsync.sendTransaction({
        transaction: [
          {
            address: FAUCET_ADDRESS,
            abi: FaucetABI,
            functionName: "claim",
            args: [
              proof.nullifier_hash,
              proof.merkle_root,
              proof.nullifier_hash,
              proof.proof,
            ],
          },
        ],
      });

      if (txPayload.status === "error") {
        setClaimStatus({ type: "error", message: "Transacción fallida" });
      } else {
        setClaimStatus({
          type: "success",
          message: "¡10 MXC reclamados! Vuelve mañana por más.",
        });
      }
    } catch (err) {
      console.error(err);
      setClaimStatus({ type: "error", message: "Error inesperado" });
    }

    setIsClaiming(false);
  }, []);

  // === BUY MXC WITH USDC ===
  const handleBuy = useCallback(async () => {
    if (!MiniKit.isInstalled()) {
      setBuyStatus({ type: "error", message: "Abre la app desde World App" });
      return;
    }

    if (!usdcAmount || parseFloat(usdcAmount) <= 0) {
      setBuyStatus({ type: "error", message: "Ingresa una cantidad de USDC" });
      return;
    }

    setIsBuying(true);
    setBuyStatus({ type: "loading", message: "Enviando transacción..." });

    try {
      // USDC has 6 decimals
      const usdcBaseUnits = BigInt(Math.floor(parseFloat(usdcAmount) * 1e6)).toString();

      // Multicall: 1) Transfer USDC to faucet, 2) Complete purchase
      const { finalPayload } = await MiniKit.commandsAsync.sendTransaction({
        transaction: [
          {
            address: USDC_ADDRESS,
            abi: USDC_ABI,
            functionName: "transfer",
            args: [FAUCET_ADDRESS, usdcBaseUnits],
          },
          {
            address: FAUCET_ADDRESS,
            abi: FaucetABI,
            functionName: "completePurchase",
            args: [usdcBaseUnits],
          },
        ],
      });

      if (finalPayload.status === "error") {
        setBuyStatus({ type: "error", message: "Transacción cancelada" });
      } else {
        setBuyStatus({
          type: "success",
          message: `¡Compraste ${estimatedMXC} MXC!`,
        });
        setUsdcAmount("");
      }
    } catch (err) {
      console.error(err);
      setBuyStatus({ type: "error", message: "Error inesperado" });
    }

    setIsBuying(false);
  }, [usdcAmount, estimatedMXC]);

  return (
    <main>
      {/* Header */}
      <header className="header">
        <div className="logo-text">MexCoin</div>
        <div className="logo-sub">Token Mexicano Premium</div>
      </header>

      {/* Balance Card */}
      <div className="balance-card">
        <div className="balance-label">MXC en circulación</div>
        <div className="balance-amount">10,000,000</div>
        <div className="balance-usd">World Chain · ERC-20</div>
      </div>

      {/* Supply Info */}
      <div className="supply-info">
        <div className="supply-item">
          <div className="supply-value">10 MXC</div>
          <div className="supply-label">Claim diario</div>
        </div>
        <div className="supply-item">
          <div className="supply-value">1 USDC</div>
          <div className="supply-label">= 500 MXC</div>
        </div>
        <div className="supply-item">
          <div className="supply-value">Orb</div>
          <div className="supply-label">Verificación</div>
        </div>
      </div>

      {/* Tab Selector */}
      <div className="section">
        <div className="tabs">
          <button
            className={`tab ${activeTab === "claim" ? "tab-active" : ""}`}
            onClick={() => setActiveTab("claim")}
          >
            Reclamar Gratis
          </button>
          <button
            className={`tab ${activeTab === "buy" ? "tab-active" : ""}`}
            onClick={() => setActiveTab("buy")}
          >
            Comprar MXC
          </button>
        </div>

        {/* CLAIM SECTION */}
        {activeTab === "claim" && (
          <div className="claim-card">
            <span className="badge badge-available">Disponible hoy</span>
            <div className="claim-amount">10 MXC</div>
            <div className="claim-desc">
              Reclama tokens gratis cada 24 horas.
              <br />
              Requiere verificación World ID (Orb).
            </div>
            <button
              className="btn btn-claim"
              onClick={handleClaim}
              disabled={isClaiming || !isInstalled}
            >
              {isClaiming ? (
                <>
                  <span className="spinner" />
                  Procesando...
                </>
              ) : !isInstalled ? (
                "Abre desde World App"
              ) : (
                "Reclamar 10 MXC"
              )}
            </button>

            {claimStatus && (
              <div className={`status status-${claimStatus.type}`}>
                {claimStatus.message}
              </div>
            )}
          </div>
        )}

        {/* BUY SECTION */}
        {activeTab === "buy" && (
          <div className="buy-card">
            <div className="input-group">
              <label className="input-label">Cantidad de USDC a enviar</label>
              <input
                type="number"
                className="input-field"
                placeholder="1.00"
                value={usdcAmount}
                onChange={(e) => setUsdcAmount(e.target.value)}
                step="0.5"
                min="0"
              />
            </div>

            {parseFloat(usdcAmount) > 0 && (
              <div className="estimate">
                Recibirás ≈ <strong>{estimatedMXC} MXC</strong>
              </div>
            )}

            <button
              className="btn btn-buy"
              onClick={handleBuy}
              disabled={isBuying || !isInstalled || !usdcAmount}
            >
              {isBuying ? (
                <>
                  <span className="spinner" />
                  Procesando...
                </>
              ) : !isInstalled ? (
                "Abre desde World App"
              ) : (
                "Comprar con USDC"
              )}
            </button>

            {buyStatus && (
              <div className={`status status-${buyStatus.type}`}>
                {buyStatus.message}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="footer">
        <div className="footer-divider" />
        MexCoin · World Chain · {new Date().getFullYear()}
      </footer>
    </main>
  );
}
