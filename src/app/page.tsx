"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  MiniKit,
  VerificationLevel,
} from "@worldcoin/minikit-js";
import FaucetABI from "@/abi/MXCFaucetV3.json";

const FAUCET_ADDRESS =
  process.env.NEXT_PUBLIC_FAUCET_ADDRESS ||
  "0x0B58Ee4c648A3AB547d059F890015802536579EE";
const APP_ID =
  process.env.NEXT_PUBLIC_APP_ID || "app_34eda6ef2b7ca54ef9e44cbde3a7652e";
const ACTION_ID = "claim-daily-mxc";
const USDC_ADDRESS = "0x79A02482A880bCE3F13e09Da970dC34db4CD24d1";
const MXC_PER_USDC = 500;
const RPC_URL = "https://worldchain-mainnet.g.alchemy.com/public";

// ABI minimo de USDC para transfer
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

type Status = {
  type: "success" | "error" | "loading";
  message: string;
} | null;

// === Helper: llamar funciones view del contrato via RPC ===
async function callContract(
  contractAddress: string,
  functionSelector: string,
  params: string = ""
): Promise<string> {
  const data = functionSelector + params;
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "eth_call",
      params: [{ to: contractAddress, data }, "latest"],
      id: 1,
    }),
  });
  const json = await res.json();
  return json.result || "0x0";
}

// Formatear segundos a HH:MM:SS
function formatCountdown(seconds: number): string {
  if (seconds <= 0) return "00:00:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export default function Home() {
  const [isInstalled, setIsInstalled] = useState(true);
  const [activeTab, setActiveTab] = useState<"claim" | "buy">("claim");
  const [usdcAmount, setUsdcAmount] = useState("");
  const [estimatedMXC, setEstimatedMXC] = useState("0");
  const [claimStatus, setClaimStatus] = useState<Status>(null);
  const [buyStatus, setBuyStatus] = useState<Status>(null);
  const [isClaiming, setIsClaiming] = useState(false);
  const [isBuying, setIsBuying] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);

  // Countdown state
  const [countdown, setCountdown] = useState<number>(0); // seconds remaining
  const [canClaimNow, setCanClaimNow] = useState(true);
  const countdownInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  // === Inicializar MiniKit y obtener wallet ===
  useEffect(() => {
    const checkInstalled = () => {
      if (MiniKit.isInstalled()) {
        setIsInstalled(true);
      }
    };

    checkInstalled();
    const t1 = setTimeout(checkInstalled, 500);
    const t2 = setTimeout(checkInstalled, 1500);
    const t3 = setTimeout(checkInstalled, 3000);

    // Intentar obtener wallet address del MiniKit
    const getWallet = async () => {
      try {
       if (MiniKit.isInstalled() && (MiniKit as any).walletAddress) {
         setWalletAddress((MiniKit as any).walletAddress);
        }
      } catch {
        // Si no esta disponible, se obtendra despues
      }
    };

    setTimeout(getWallet, 2000);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, []);

  // === Verificar cooldown cuando tenemos wallet ===
  useEffect(() => {
    if (!walletAddress) return;

    const checkCooldown = async () => {
      try {
        // lastClaim(address) selector = 0x5c16e15e
        // Pad address to 32 bytes
        const paddedAddr = walletAddress.slice(2).toLowerCase().padStart(64, "0");
        const result = await callContract(
          FAUCET_ADDRESS,
          "0x5c16e15e",
          paddedAddr
        );

        const lastClaimTimestamp = parseInt(result, 16);

        if (lastClaimTimestamp === 0) {
          // Nunca ha reclamado
          setCanClaimNow(true);
          setCountdown(0);
          return;
        }

        // claimCooldown() selector = 0x1e83409a â en realidad necesitamos el valor
        // Sabemos que es 24h = 86400 seconds
        const cooldown = 86400;
        const nextClaimTime = lastClaimTimestamp + cooldown;
        const now = Math.floor(Date.now() / 1000);

        if (now >= nextClaimTime) {
          setCanClaimNow(true);
          setCountdown(0);
        } else {
          setCanClaimNow(false);
          setCountdown(nextClaimTime - now);
        }
      } catch (err) {
        console.error("Error checking cooldown:", err);
        // Default: permitir intento
        setCanClaimNow(true);
      }
    };

    checkCooldown();
  }, [walletAddress]);

  // === Countdown timer ===
  useEffect(() => {
    if (countdownInterval.current) {
      clearInterval(countdownInterval.current);
    }

    if (countdown > 0) {
      countdownInterval.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            setCanClaimNow(true);
            if (countdownInterval.current) {
              clearInterval(countdownInterval.current);
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (countdownInterval.current) {
        clearInterval(countdownInterval.current);
      }
    };
  }, [countdown]);

  // Estimate MXC for USDC amount
  useEffect(() => {
    if (!usdcAmount || parseFloat(usdcAmount) <= 0) {
      setEstimatedMXC("0");
      return;
    }
    const mxc = parseFloat(usdcAmount) * MXC_PER_USDC;
    setEstimatedMXC(mxc.toLocaleString("es-MX"));
  }, [usdcAmount]);

  // === Iniciar cooldown de 24h despues de claim exitoso ===
  const startCooldown = () => {
    setCanClaimNow(false);
    setCountdown(86400); // 24 horas
  };

  // === CLAIM DAILY MXC (V3: backend firma ticket) ===
  const handleClaim = useCallback(async () => {
    if (!MiniKit.isInstalled()) {
      setClaimStatus({
        type: "error",
        message: "Abre la app desde World App",
      });
      return;
    }

    setIsClaiming(true);
    setClaimStatus({ type: "loading", message: "Verificando identidad..." });

    try {
      // Paso 1: Verificar World ID via MiniKit
      const { finalPayload } = await MiniKit.commandsAsync.verify({
        action: ACTION_ID,
        verification_level: VerificationLevel.Orb,
      });

      if (finalPayload.status === "error") {
        setClaimStatus({
          type: "error",
          message: "Verificacion cancelada o fallida",
        });
        setIsClaiming(false);
        return;
      }

      setClaimStatus({ type: "loading", message: "Generando ticket..." });

      // Obtener wallet address
      const userAddr = (MiniKit as any).walletAddress || walletAddress;
      if (!userAddr) {
        setClaimStatus({
          type: "error",
          message: "No se pudo obtener tu wallet. Recarga la app.",
        });
        setIsClaiming(false);
        return;
      }

      // Paso 2: Enviar proof al backend para verificacion cloud + firma de ticket
      const verifyRes = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payload: finalPayload,
          action: ACTION_ID,
          userAddress: userAddr,
        }),
      });

      const verifyData = await verifyRes.json();

      if (verifyData.status !== 200) {
        const errorMsg =
          verifyData.error || "Verificacion fallida. Intenta de nuevo.";
        setClaimStatus({ type: "error", message: errorMsg });
        setIsClaiming(false);
        return;
      }

      setClaimStatus({ type: "loading", message: "Enviando transaccion..." });

      // Paso 3: Enviar transaccion al contrato V3 con el ticket firmado
      const { nullifierHash, deadline, signature } = verifyData;

      const { finalPayload: txPayload } =
        await MiniKit.commandsAsync.sendTransaction({
          transaction: [
            {
              address: FAUCET_ADDRESS,
              abi: FaucetABI,
              functionName: "claim",
              args: [nullifierHash, deadline, signature],
            },
          ],
        });

      if (txPayload.status === "error") {
        setClaimStatus({
          type: "error",
          message: "Transaccion fallida en la blockchain",
        });
      } else {
        setClaimStatus({
          type: "success",
          message: "10 MXC reclamados! Vuelve manana por mas.",
        });
        startCooldown();
        // Guardar wallet para futuras consultas
        if (userAddr) setWalletAddress(userAddr);
      }
    } catch (err) {
      console.error("Claim error:", err);
      setClaimStatus({ type: "error", message: "Error inesperado" });
    }

    setIsClaiming(false);
  }, [walletAddress]);

  // === BUY MXC WITH USDC ===
  const handleBuy = useCallback(async () => {
    if (!MiniKit.isInstalled()) {
      setBuyStatus({
        type: "error",
        message: "Abre la app desde World App",
      });
      return;
    }

    if (!usdcAmount || parseFloat(usdcAmount) <= 0) {
      setBuyStatus({
        type: "error",
        message: "Ingresa una cantidad de USDC",
      });
      return;
    }

    setIsBuying(true);
    setBuyStatus({ type: "loading", message: "Enviando transaccion..." });

    try {
      // USDC has 6 decimals
      const usdcBaseUnits = BigInt(
        Math.floor(parseFloat(usdcAmount) * 1e6)
      ).toString();

      // Multicall: 1) Transfer USDC to faucet, 2) Complete purchase
      const { finalPayload } =
        await MiniKit.commandsAsync.sendTransaction({
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
        setBuyStatus({ type: "error", message: "Transaccion cancelada" });
      } else {
        setBuyStatus({
          type: "success",
          message: `Compraste ${estimatedMXC} MXC!`,
        });
        setUsdcAmount("");
      }
    } catch (err) {
      console.error("Buy error:", err);
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
        <div className="balance-label">MXC en circulacion</div>
        <div className="balance-amount">10,000,000</div>
        <div className="balance-usd">World Chain &middot; ERC-20</div>
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
          <div className="supply-label">Verificacion</div>
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
            {/* Badge + Countdown */}
            {canClaimNow ? (
              <span className="badge badge-available">Disponible ahora</span>
            ) : (
              <span className="badge badge-cooldown">En espera</span>
            )}

            <div className="claim-amount">10 MXC</div>

            {/* === COUNTDOWN TIMER === */}
            {!canClaimNow && countdown > 0 && (
              <div className="countdown-container">
                <div className="countdown-label">Proximo claim en</div>
                <div className="countdown-timer">
                  {formatCountdown(countdown)}
                </div>
                <div className="countdown-bar">
                  <div
                    className="countdown-bar-fill"
                    style={{
                      width: `${((86400 - countdown) / 86400) * 100}%`,
                    }}
                  />
                </div>
              </div>
            )}

            <div className="claim-desc">
              {canClaimNow
                ? "Reclama tokens gratis cada 24 horas. Requiere verificacion World ID (Orb)."
                : "Ya reclamaste hoy. Vuelve cuando el temporizador llegue a cero."}
            </div>

            <button
              className="btn btn-claim"
              onClick={handleClaim}
              disabled={isClaiming || !canClaimNow}
            >
              {isClaiming ? (
                <>
                  <span className="spinner" />
                  Procesando...
                </>
              ) : canClaimNow ? (
                "Reclamar 10 MXC"
              ) : (
                "Espera para reclamar"
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
                Recibiras â <strong>{estimatedMXC} MXC</strong>
              </div>
            )}

            <button
              className="btn btn-buy"
              onClick={handleBuy}
              disabled={isBuying || !usdcAmount}
            >
              {isBuying ? (
                <>
                  <span className="spinner" />
                  Procesando...
                </>
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
        MexCoin &middot; World Chain &middot; {new Date().getFullYear()}
      </footer>
    </main>
  );
}
