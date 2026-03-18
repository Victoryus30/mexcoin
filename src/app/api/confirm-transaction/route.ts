import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { transaction_id } = await req.json();
    const app_id = process.env.APP_ID;

    const response = await fetch(
      `https://developer.worldcoin.org/api/v2/minikit/transaction/${transaction_id}?app_id=${app_id}&type=transaction`,
      { method: "GET" }
    );

    const transaction = await response.json();
    return NextResponse.json(transaction);
  } catch (error) {
    console.error("Transaction confirmation error:", error);
    return NextResponse.json({ error: "Failed to confirm" }, { status: 500 });
  }
}
