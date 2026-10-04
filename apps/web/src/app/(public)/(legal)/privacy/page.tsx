import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { ContentPage, contentPageMetadata } from '@/components/ContentPage';

export const revalidate = 3600;
export const generateMetadata = (): Promise<Metadata> => contentPageMetadata('privacy');
export default function PrivacyPage(): ReactNode {
  return <ContentPage slug="privacy" />;
}
