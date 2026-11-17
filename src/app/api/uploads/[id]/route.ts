import { handleDeleteUpload } from "@/runtime/photo-api";

/** DELETE /api/uploads/{id}: S03-P [삭제] for a photo not attached to anything. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleDeleteUpload(request, id);
}
