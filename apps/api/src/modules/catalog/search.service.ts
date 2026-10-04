import { Inject, Injectable } from '@nestjs/common';
import type { Knex } from 'knex';
import type { ProductCard, SearchResponse } from '@fb/shared-types';
import { KNEX } from '../../database/knex.provider';
import { CACHE, type ICacheProvider } from '../../common/cache/cache.provider';
import { Log } from '../../common/logger';
import { booleanQuery, expandTerms, likePattern, normalizeQuery, terms } from '../../domain/search';
import { ComplianceService } from './compliance.service';
import { CatalogService } from './catalog.service';
import { CARD_COLUMNS, supplierNameCol, IMG_SUBQUERIES, cardBase, toCard, type CardRow } from './product-mapper';

/** A10 — synonyms → FULLTEXT (fast path) → LIKE fallback (short/Devanagari terms) → log. */
@Injectable()
export class SearchService {
  constructor(
    @Inject(KNEX) private readonly db: Knex,
    @Inject(CACHE) private readonly cache: ICacheProvider,
    private readonly compliance: ComplianceService,
    private readonly catalog: CatalogService,
  ) {}

  private synonyms(): Promise<Map<string, string>> {
    return this.cache.wrap('catalog:synonyms', 10 * 60_000, async () => {
      const rows = (await this.db('search_synonyms').where({ is_active: 1 }).select('term', 'maps_to')) as { term: string; maps_to: string }[];
      return new Map(rows.map((r) => [r.term.toLowerCase(), r.maps_to]));
    });
  }

  private base(verticals: string[]): Knex.QueryBuilder {
    return cardBase(this.db, verticals);
  }

  async search(rawQ: string, userId: number | null, limit = 24): Promise<SearchResponse> {
    const q = normalizeQuery(rawQ);
    if ([...q].length < 2) return { query: q, items: [], suggestions: [], total: 0 };
    const verticals = await this.compliance.sqlVerticals();
    const syn = await this.synonyms();
    const t = terms(q);
    const bool = booleanQuery(t, syn);
    const seen = new Map<number, CardRow>();

    if (bool) {
      const rows = (await this.base(verticals)
        .whereRaw('MATCH(p.name, p.name_hi, p.search_text) AGAINST (? IN BOOLEAN MODE)', [bool])
        .select(CARD_COLUMNS)
        .select(supplierNameCol(this.db))
        .select(this.db.raw(IMG_SUBQUERIES.join(', ')))
        .orderByRaw('MATCH(p.name, p.name_hi, p.search_text) AGAINST (? IN BOOLEAN MODE) DESC', [bool])
        .orderBy('p.sold_count', 'desc')
        .limit(limit)) as CardRow[];
      for (const r of rows) seen.set(Number(r.id), r);
    }
    const shortTerm = t.some((x) => [...x].length < 3);
    if (seen.size < 3 || shortTerm) {
      const variants = expandTerms(t, syn).slice(0, 8);
      const rows = (await this.base(verticals)
        .where((w) => {
          for (const v of [q, ...variants]) {
            const pat = likePattern(v);
            w.orWhere('p.name', 'like', pat).orWhere('p.name_hi', 'like', pat).orWhere('p.search_text', 'like', pat);
          }
        })
        .select(CARD_COLUMNS)
        .select(supplierNameCol(this.db))
        .select(this.db.raw(IMG_SUBQUERIES.join(', ')))
        .orderBy('p.sold_count', 'desc')
        .limit(limit)) as CardRow[];
      for (const r of rows) if (!seen.has(Number(r.id))) seen.set(Number(r.id), r);
    }
    const items = [...seen.values()].slice(0, limit).map(toCard);
    // search_logs is the "what to stock next" list — log every query (async, never blocks the response)
    void this.db('search_logs').insert({ query: q.slice(0, 160), results_count: items.length, user_id: userId }).catch((e) => Log.warn('search.log_failed', { err: String(e) }));
    const suggestions: ProductCard[] = items.length === 0 ? (await this.catalog.listProducts({ sort: 'popular' }, 1, 6)).items : [];
    return { query: q, items, suggestions, total: items.length };
  }

  /** Autocomplete: max 8, 60 s cache, name prefix/substring only (cheap). */
  async suggest(rawQ: string): Promise<{ slug: string; name: string; nameHi: string | null }[]> {
    const q = normalizeQuery(rawQ).toLowerCase();
    if ([...q].length < 2) return [];
    return this.cache.wrap(`catalog:suggest:${q}`, 60_000, async () => {
      const verticals = await this.compliance.sqlVerticals();
      const syn = await this.synonyms();
      const variants = expandTerms(terms(q), syn).slice(0, 6);
      return (await this.base(verticals)
        .where((w) => {
          for (const v of [q, ...variants]) {
            const pat = likePattern(v);
            w.orWhere('p.name', 'like', pat).orWhere('p.name_hi', 'like', pat).orWhere('p.search_text', 'like', pat);
          }
        })
        .orderBy('p.sold_count', 'desc')
        .limit(8)
        .select('p.slug', 'p.name', 'p.name_hi as nameHi')) as { slug: string; name: string; nameHi: string | null }[];
    });
  }

  /** "हमें बताएं" from a zero-result search → contact_messages (demand list). */
  async requestProduct(query: string, name: string, phone: string, ip: string): Promise<void> {
    await this.db('contact_messages').insert({ name: name.slice(0, 120), phone: `91${phone}`, subject: `PRODUCT_REQUEST: ${query}`.slice(0, 180), message: `ग्राहक यह सामान ढूंढ रहा था: ${query}`.slice(0, 2000), ip_address: ip });
  }
}
