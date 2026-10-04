import { permanentRedirect } from 'next/navigation';

/** Category pages now live at /<slug> (shorter, one canonical URL). Old links keep working. */
export default async function LegacyCategory({ params }: { params: Promise<{ slug: string }> }): Promise<never> {
  const { slug } = await params;
  permanentRedirect(`/${encodeURIComponent(slug)}`);
}
