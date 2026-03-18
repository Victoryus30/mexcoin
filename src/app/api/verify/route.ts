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
}

export async function POST(req: NextRequest) {
  try {
    const { payload, action, signal } = (await req.json()) as IRequestPayload;
    const app_id = process.env.APP_ID as `app_${string}`;

    const verifyRes = (await verifyCloudProof(
      payload,
      app_id,
      action,
      signal
    )) as IVerifyResponse;

    if (verifyRes.success) {
      return NextResponse.json({ verifyRes, status: 200 });
    } else {
      return NextResponse.json({ verifyRes, status: 400 });
    }
  } catch (error) {
    console.error("Verification error:", error);
    return NextResponse.json({ error: "Verification failed", status: 500 });
  }
}
