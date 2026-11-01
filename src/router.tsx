/**
 * Route table for the whole SPA, built with react-router's createBrowserRouter (see `router` below).
 * Maps URLs to screens in src/pages and wraps them in the auth guards (RequireAuth, RequireAdmin) and
 * Layout from auth/AuthProvider.tsx and components/Layout.tsx. Implements the navigation map of SRS section 8 and
 * the admin-only rule of FR-04. Calls no API itself. In AUTH_BYPASS mode (lib/config.ts, sample-data mode only) /login simply
 * redirects to / and RequireAuth lets everyone in. The private screens are lazy-loaded (code splitting); Layout shows a
 * spinner in the content area while a screen's code loads.
 */

import { lazy } from 'react';
import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom';
import { RecoveryRedirect, RequireAdmin, RequireAuth } from '@/auth/AuthProvider';
import { Layout } from '@/components/Layout';
import { CREATE_ADMIN_PATH } from '@/lib/config';
import CreateAdmin from '@/pages/CreateAdmin';
import Login from '@/pages/Login';
import SignUp from '@/pages/SignUp';
import ResetPassword from '@/pages/ResetPassword';

/** Screens are loaded on first visit (code splitting), so the first page load only carries the shell and the sign-in screens. */
const QuoteForm = lazy(() => import('@/pages/QuoteForm'));
const QuoteTemplate = lazy(() => import('@/pages/QuoteTemplate'));
const Settings = lazy(() => import('@/pages/Settings'));
const PartnerDetail = lazy(() => import('@/pages/PartnerDetail'));
const ProductEdit = lazy(() => import('@/pages/ProductEdit'));
const QuoteDetail = lazy(() => import('@/pages/QuoteDetail'));
const Quotes = lazy(() => import('@/pages/Quotes'));
const Pipeline = lazy(() => import('@/pages/Pipeline'));
const Buyers = lazy(() => import('@/pages/Buyers'));
const BuyerDetail = lazy(() => import('@/pages/BuyerDetail'));
const Products = lazy(() => import('@/pages/Products'));
const ProductDetail = lazy(() => import('@/pages/ProductDetail'));
const DailyRatesPage = lazy(() => import('@/pages/DailyRatesPage'));
const Partners = lazy(() => import('@/pages/Partners'));
const Inquiries = lazy(() => import('@/pages/Inquiries'));
const InquiryDetail = lazy(() => import('@/pages/InquiryDetail'));
const InquiryEdit = lazy(() => import('@/pages/InquiryEdit'));
const Followups = lazy(() => import('@/pages/Followups'));
const Orders = lazy(() => import('@/pages/Orders'));
const Today = lazy(() => import('@/pages/Today'));

/**
 * Top-level route element: renders <RecoveryRedirect /> (watches for the password-recovery event and sends
 * the user to /reset-password) and then whichever child route matched. Has no UI of its own.
 */
const Root = () => (<><RecoveryRedirect /><Outlet /></>);

/**
 * The app's route table (SRS section 8). A DATA router (createBrowserRouter) is required, because
 * useUnsavedChanges (lib/hooks.ts) uses useBlocker, which only works with data routers. Structure:
 * - /login, /reset-password: public (no Layout, no auth check).
 * - RequireAuth: everything below needs a signed-in user with a profile (see auth/AuthProvider.tsx; in
 *   AUTH_BYPASS mode the sign-in check is skipped).
 * - Layout: sidebar (desktop) / tab bar (phone) around the screen.
 * - Private screens: / (Today), /pipeline, /buyers, /buyers/:id, /inquiries (+ new, :id, :id/edit), /quotes (+ new, template, :id,
 *   :id/edit), /follow-ups, /products (+ new, :name, :name/edit), /daily-rates, /partners (+ :id), /orders and /settings (admin only).
 *   /quotations redirects to /quotes; any unknown URL redirects to / (replace, so Back does not loop).
 * - Marketing and Trade intelligence are not part of the app (removed); there is no /marketing route.
 */
export const router = createBrowserRouter([
  {
    element: <Root />,
    children: [
      { path: '/login', element: <Login /> },
      { path: '/sign-up', element: <SignUp /> },
      // first-time setup of the administrator: public, works once (the API decides); see pages/CreateAdmin.tsx
      { path: CREATE_ADMIN_PATH, element: <CreateAdmin /> },
      { path: '/reset-password', element: <ResetPassword /> },
      {
        element: <RequireAuth />,
        children: [
          {
            element: <Layout />,
            children: [
              { path: '/', element: <Today /> },
              { path: '/quotes', element: <Quotes /> },
              { path: '/quotations', element: <Navigate to="/quotes" replace /> },
              { path: '/quotes/template', element: <QuoteTemplate /> },
              { path: '/quotes/new', element: <QuoteForm /> },
              { path: '/quotes/:id/edit', element: <QuoteForm /> },
              { path: '/quotes/:id', element: <QuoteDetail /> },
              { path: '/buyers', element: <Buyers /> },
              { path: '/pipeline', element: <Pipeline /> },
              { path: '/inquiries', element: <Inquiries /> },
              { path: '/inquiries/new', element: <InquiryEdit /> },
              { path: '/inquiries/:id/edit', element: <InquiryEdit /> },
              { path: '/inquiries/:id', element: <InquiryDetail /> },
              { path: '/buyers/:id', element: <BuyerDetail /> },
              { path: '/follow-ups', element: <Followups /> },
              { path: '/products', element: <Products /> },
              { path: '/products/:name', element: <ProductDetail /> },
              { path: '/daily-rates', element: <DailyRatesPage /> },
              { path: '/partners', element: <Partners /> },
              { path: '/partners/:id', element: <PartnerDetail /> },
              { path: '/orders', element: <Orders /> },
              { element: <RequireAdmin />, children: [{ path: '/settings', element: <Settings /> }, { path: '/products/new', element: <ProductEdit /> }, { path: '/products/:name/edit', element: <ProductEdit /> }] },
              { path: '*', element: <Navigate to="/" replace /> },
            ],
          },
        ],
      },
    ],
  },
]);
