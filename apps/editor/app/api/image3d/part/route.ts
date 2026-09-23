import { handleMockImage3d } from '@/lib/mock-image3d'

export async function POST(req: Request) {
  return handleMockImage3d(req, 'part')
}
