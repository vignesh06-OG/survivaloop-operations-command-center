import { NextRequest, NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";
import { requireCapability, handleError } from "@/server/request";

cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireCapability("submit_proof");

    const formData = await req.formData();
    const file = formData.get("image") as File | null;
    const entityType = formData.get("entityType") as string || "general";
    const entityId = formData.get("entityId") as string || "unknown";

    if (!file) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }

    const hasKeys = !!(process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);

    // Read file as ArrayBuffer, then convert to base64
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64String = buffer.toString('base64');
    const dataUri = `data:${file.type};base64,${base64String}`;

    if (!hasKeys) {
      // Fallback: return mock URL and the base64 string directly so the client can cache it
      const uuid = crypto.randomUUID();
      const mockUrl = `mock://photo/${uuid}.jpg`;
      return NextResponse.json({
        url: mockUrl,
        publicId: uuid,
        format: "jpg",
        bytes: file.size,
        base64: dataUri, // Important for IndexedDB fallback
        isMock: true
      });
    }

    // Upload to Cloudinary
    const result = await cloudinary.uploader.upload(dataUri, {
      folder: `survivaloop/${entityType}/${entityId}`,
    });

    return NextResponse.json({
      url: result.secure_url,
      publicId: result.public_id,
      format: result.format,
      bytes: result.bytes,
      isMock: false
    });

  } catch (e: any) {
    console.error("Upload Error:", e);
    return handleError(e);
  }
}
