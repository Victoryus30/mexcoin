import { NextRequest, NextResponse } from "next/server";
import {
  verifyCloudProof,
  IVerifyResponse,
  ISuccessResult,
} from "@worldcoin/minikit-js";

interface IRequestPayload {
  payload: ISuccessResult;
  action: string;
  signal?: string;
  userAddress: string;
}

/**
 * POST /api/verify
 *
 * Flujo:
 *   1. Recibe proof de World ID + wallet address del usuario
 *   2. Verifica proof con verifyCloudProof (endpoint v2, calcula signal_hash)
 *   3. Si valido, firma un ticket ECDSA: (userAddress, nullifierHash, deadline)
 *   4. Retorna ticket firmado para que el frontend lo envie al contrato V3
 */
export async function POST(req: NextRequest) {
  try {
    const { payload, action, signal, userAddress } =
      (await req.json()) as IRequestPayload;

    const app_id = (process.env.APP_ID || process.env.NEXT_PUBLIC_APP_ID) as `app_${string}`;

    if (!app_id) {
      return NextResponse.json(
        { error: "APP_ID no configurado en el servidor", status: 500 },
      );
    }

    if (!userAddress || !userAddress.startsWith("0x")) {
      return NextResponse.json(
        { error: "Wallet address invalida", status: 400 },
      );
    }

    // === PASO 1: Verificar proof con verifyCloudProof ===
    // Usa endpoint v2 por defecto. Calcula signal_hash internamente.
    console.log("APP_ID:", app_id);
    console.log("Action:", action);
    console.log("Payload keys:", Object.keys(payload));

    const verifyRes = (await verifyCloudProof(
      payload,
      app_id,
      action,
      signal
    )) as IVerifyResponse;

    console.log("verifyCloudProof response:", JSON.stringify(verifyRes));

    if (!verifyRes.success) {
      return NextResponse.json({
        error: "Verificacion de World ID fallida",
        details: verifyRes,
        status: 400,
      });
    }

    console.log("World ID verification SUCCESS");

    // === PASO 2: Firmar ticket para el contrato ===
    const SIGNER_PRIVATE_KEY = process.env.SIGNER_PRIVATE_KEY;
    if (!SIGNER_PRIVATE_KEY) {
      return NextResponse.json(
        { error: "SIGNER_PRIVATE_KEY no configurado", status: 500 },
      );
    }

    const nullifierHash = payload.nullifier_hash;
    const deadline = Math.floor(Date.now() / 1000) + 300;

    const { keccak256, encodePacked, toBytes } = await import("viem");
    const { privateKeyToAccount } = await import("viem/accounts");

    const ticketHash = keccak256(
      encodePacked(
        ["address", "uint256", "uint256"],
        [userAddress as `0x${string}`, BigInt(nullifierHash), BigInt(deadline)]
      )
    );

    const account = privateKeyToAccount(SIGNER_PRIVATE_KEY as `0x${string}`);
    const signature = await account.signMessage({
      message: { raw: toBytes(ticketHash) },
    });

    return NextResponse.json({
      status: 200,
      nullifierHash,
      deadline,
      signature,
    });
  } catch (error: unknown) {
    console.error("Verification error:", error);
    const message = error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json({ error: message, status: 500 });
  }
}
