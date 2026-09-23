import { handleMockImage3d } from '@/lib/mock-image3d'

export async function GET() {
  return handleMockImage3d(new Request('http://local/api/image3d/config'), 'config')
}
