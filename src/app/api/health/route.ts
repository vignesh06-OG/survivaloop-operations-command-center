import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    status: "ok",
    demoMode: process.env.DEMO_MODE === "1" || process.env.DEMO_MODE === "true",
    vercel: process.env.VERCEL === "1",
    timestamp: new Date().toISOString()
  });
}
