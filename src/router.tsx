/**
 * Route table for the whole SPA, built with react-router's createBrowserRouter (see `router` below).
 * Maps URLs to screens in src/pages and wraps them in the auth guards (RequireAuth, RequireAdmin) and
 * Layout
 * from auth/AuthProvider.tsx and components/Layout.tsx. Implements the navigation map of SRS section 8 and
 * the admin-only rule of FR-04. Calls no API itself. In AUTH_BYPASS mode (lib/config.ts) /login simply
 * redirects to / and RequireAuth lets everyone in.
 */

import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom';
import { RecoveryRedirect, RequireAdmin, RequireAuth } from '@/auth/AuthProvider';
import { Layout } from '@/components/Layout';
import Today from '@/pages/Today';
import BuyerDetail from '@/pages/BuyerDetail';
import Buyers from '@/pages/Buyers';
import Pipeline from '@/pages/Pipeline';
import ProductDetail from '@/pages/ProductDetail';
import QuoteTemplate from '@/pages/QuoteTemplate';
import ProductEdit from '@/pages/ProductEdit';
import Followups from '@/pages/Followups';
import Products from '@/pages/Products';
import Settings from '@/pages/Settings';
import Login from '@/pages/Login';
import Orders from '@/pages/Orders';
import QuoteDetail from '@/pages/QuoteDetail';
import QuoteForm from '@/pages/QuoteForm';
import Quotes from '@/pages/Quotes';
import ResetPassword from '@/pages/ResetPassword';

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
 * - /, /quotes, /quotes/new, /quotes/:id/edit, /quotes/:id: Today, Quotes, QuoteForm (new), QuoteForm (edit
 *   a draft), QuoteDetail.
 * - /buyers, /buyers/:id: Buyers, BuyerDetail.
 * - Only Quotes and Buyers are routed on main for now. Today, Products, Settings, Marketing and Trade
 *   intelligence are on the feature-0002 branch. "/" and any unknown URL redirect to /quotes (replace, so Back
 *   does not loop).
 */
export const router = createBrowserRouter([
  {
    element: <Root />,
    children: [
      { path: '/login', element: <Login /> },
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
              { path: '/buyers/:id', element: <BuyerDetail /> },
              { path: '/follow-ups', element: <Followups /> },
              { path: '/products', element: <Products /> },
              { path: '/products/:name', element: <ProductDetail /> },
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
