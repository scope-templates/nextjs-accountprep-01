import { patchStaff, requestDeps } from '@/lib/handlers';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return patchStaff(requestDeps(req), (await params).id, req);
}
