/**
 * App entry point (loaded by index.html). Creates the react-query client, wraps the app in its providers
 * and starts the router. No screen logic lives here.
 * Providers: QueryClientProvider (server-data cache), ToastProvider (components/ui.tsx), AuthProvider
 * (auth/AuthProvider.tsx) and RouterProvider (router.tsx). Global styles come from ./index.css.
 * AUTH_BYPASS (lib/config.ts) is read inside AuthProvider, not here.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { AuthProvider } from '@/auth/AuthProvider';
import { ToastProvider } from '@/components/ui';
import { startResponsiveTables } from '@/lib/responsiveTables';
import { router } from './router';
import './index.css';

// One shared react-query cache for the whole app. Defaults for every useQuery:
// - retry: 1 -> a failed request is retried once before the screen shows ErrorNote.
// - staleTime: 30 s -> data counts as fresh for 30 seconds, so moving between screens does not refetch at
//   once (useSettings overrides this to 5 minutes in lib/hooks.ts).
// - refetchOnWindowFocus: true -> when the browser tab is focused again, stale queries reload, so the Today
//   dashboard and lists catch up after the user was in another app.
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000, refetchOnWindowFocus: true } },
});

// Mount point is <div id="root"> in index.html. Provider order matters, outermost first:
// QueryClientProvider (cache) > ToastProvider (useToast) > AuthProvider (session + profile, uses the query
// client to clear the cache on sign-out) > RouterProvider (router.tsx; every screen is inside these).
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
);

// tables with the class `rt` become cards on phones; their cells are labelled with the column heading (lib/responsiveTables.ts, index.css)
startResponsiveTables();
