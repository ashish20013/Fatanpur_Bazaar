import { Injectable } from '@nestjs/common';
import { VERTICAL_LABEL_EN, VERTICAL_LABEL_HI, VERTICAL_SLUG, type Vertical } from '@fb/shared-types';
import { SettingsService } from '../settings/settings.service';

/**
 * The ONE place that decides which verticals exist (BUILD_PROMPT §1). A disabled vertical vanishes
 * from nav, home, categories, search, suggest, sitemap, JSON-LD and direct URLs — every query in the
 * catalog uses `sqlVerticals()` instead of re-implementing the check.
 */
@Injectable()
export class ComplianceService {
  constructor(private readonly settings: SettingsService) {}

  enabledVerticals(): Promise<Vertical[]> {
    return this.settings.enabledVerticals();
  }

  /** For SQL IN (...): enabled verticals + 'OTHER' (general merchandise — needs no licence, always on). */
  async sqlVerticals(): Promise<string[]> {
    return [...(await this.enabledVerticals()), 'OTHER'];
  }

  async isEnabled(v: string): Promise<boolean> {
    return v === 'OTHER' || (await this.enabledVerticals()).includes(v as Vertical);
  }

  /**
   * Owner's Sept-2026 brief lists Medicals and Kheti among the top categories. Until the licence
   * arrives their vertical stays OFF — the home rail may still name them as "जल्द आ रहा है"
   * (no link, no products, nothing in search/sitemap/JSON-LD). Switchable in settings.
   */
  showUpcoming(): Promise<boolean> {
    return this.settings.bool('show_upcoming_categories', true);
  }

  async navItems(): Promise<{ vertical: Vertical; slug: string; labelHi: string; labelEn: string }[]> {
    return (await this.enabledVerticals()).map((v) => ({ vertical: v, slug: VERTICAL_SLUG[v], labelHi: VERTICAL_LABEL_HI[v], labelEn: VERTICAL_LABEL_EN[v] }));
  }
}
