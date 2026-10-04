import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { ContentPage, contentPageMetadata } from '@/components/ContentPage';

export const revalidate = 3600;
export const generateMetadata = (): Promise<Metadata> => contentPageMetadata('terms');
export default function TermsPage(): ReactNode {
  return <ContentPage slug="terms" />;
}
