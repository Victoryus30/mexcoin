import { NextRequest, NextResponse } from "next/server";
import { ISuccessResult } from "@worldcoin/minikit-js";

interface IRequestPayload {
  payload: ISuccessResult;
  action: string;
  signal?: string;
  userAddress: string;
}

// signal_hash de string vacio "" segun World ID docs
const EMPTY_SIGNAL_HASH =
  "0x00c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a4";

/**
 * POST /api/verify
 *
 * Flujo:
 *   1. Recibe proof de World ID + wallet address del usuario
 *   2. Verifica proof via API v4 de World ID (formato legacy 3.0)
 *   3. Si valido, firma un ticket ECDSA: (userAddress, nullifierHash, deadline)
 *   4. Retorna ticket firmado para que el frontend lo envie al contrato V3
 */
export async function POST(req: NextRequest) {
  try {
    const { payload, action, signal, userAddress } =
      (await req.json()) as IRequestPayload;

    const app_id = (process.env.APP_ID || process.env.NEXT_PUBLIC_APP_ID) as string;

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

    // === PASO 1: Verificar proof via API v4 (formato legacy World ID 3.0) ===
    // MiniKit genera proofs en formato legacy (3.0).
    // v4 requiere: protocol_version, nonce, action, environment, responses[]
    // En responses: identifier (no verification_level), nullifier (no nullifier_hash)
    const v4Body = {
      protocol_version: "3.0",
      nonce: crypto.randomUUID(),
      action,
      environment: "production",
      responses: [
        {
          identifier: payload.verification_level,
          signal_hash: EMPTY_SIGNAL_HASH,
          proof: payload.proof,
          merkle_root: payload.merkle_root,
          nullifier: payload.nullifier_hash,
        },
      ],
    };

    console.log("Sending to v4:", JSON.stringify(v4Body));

    const verifyResponse = await fetch(
      `https://developer.world.org/api/v4/verify/${app_id}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(v4Body),
      }
    );

    const verifyData = await verifyResponse.json().catch(() => ({}));
    console.log("v4 status:", verifyResponse.status, "body:", JSON.stringify(verifyData));

    if (!verifyResponse.ok) {
      return NextResponse.json({
        error: "Verificacion de World ID fallida",
        details: verifyData,
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
