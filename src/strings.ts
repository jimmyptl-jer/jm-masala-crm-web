/**
 * Single entry point for all UI text. Each screen's strings live in its own file under src/strings/ and
 * are collected into one `t` object here. Pure data: no API calls, no react-query keys, no components.
 * Implements the "all strings in one place" rule of SRS section 8 (easy translation later).
 */

import { buyerForm, common, login, nav } from './strings/common';
import { buyers } from './strings/buyers';
import { crm } from './strings/buyersCrm';
import { buyersPage } from './strings/buyersPage';
import { followups } from './strings/followups';
import { inquiries } from './strings/inquiries';
import { orders } from './strings/orders';
import { partners } from './strings/partners';
import { pipeline } from './strings/pipeline';
import { products } from './strings/products';
import { quoteDetail } from './strings/quoteDetail';
import { quoteForm } from './strings/quoteForm';
import { quotes } from './strings/quotes';
import { samples } from './strings/samples';
import { send } from './strings/send';
import { setup, signup } from './strings/setup';
import { settings } from './strings/settings';
import { today } from './strings/today';

/**
 * The `t` object: every user-visible string, grouped per screen (t.common, t.nav, t.login, t.buyerForm,
 * t.today, t.quotes, t.quoteForm, t.quoteDetail, t.buyers, t.products, t.settings). Components import `t`
 * and read e.g. t.buyers.title. Some entries are plain strings, some are functions that build a string from
 * a number or name (e.g. t.buyers.quoteCount(3)). Add a language by swapping this object (SRS section 8).
 */
export const t = { common, nav, login, buyerForm, today, quotes, quoteForm, quoteDetail, buyers, products, settings, send, crm, pipeline, inquiries, partners, samples, buyersPage, orders, followups, setup, signup };
