import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { ContentPage, contentPageMetadata } from '@/components/ContentPage';

export const revalidate = 3600;
export const generateMetadata = (): Promise<Metadata> => contentPageMetadata('shipping');
export default function ShippingPage(): ReactNode {
  return <ContentPage slug="shipping" />;
}
