import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { ContentPage, contentPageMetadata } from '@/components/ContentPage';

export const revalidate = 3600;
export const generateMetadata = (): Promise<Metadata> => contentPageMetadata('refund');
export default function RefundPage(): ReactNode {
  return <ContentPage slug="refund" />;
}
