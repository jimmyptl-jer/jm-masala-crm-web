/**
 * Add / edit an inquiry as a full page: /inquiries/new (optionally ?buyer=<id>) and /inquiries/:id/edit (see router.tsx).
 * Hosts InquiryForm and sends the user to the inquiry's page after saving. API: GET /inquiries/:id to load the inquiry being edited
 * (key ['inquiry', id]); saving is done by InquiryForm.
 */
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft } from 'lucide-react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { InquiryForm } from '@/components/inquiries/InquiryForm';
import { ErrorNote, PageHeader, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import type { InquiryDetail } from '@/lib/types';
import { t } from '@/strings';

const s = t.inquiries;

export default function InquiryEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const query = useQuery({ queryKey: ['inquiry', id], queryFn: () => api.get<InquiryDetail>(`/inquiries/${id}`), enabled: !!id });
  const back = id ? `/inquiries/${id}` : '/inquiries';
  return (
    <div className="space-y-4">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm text-slate-600">
        <Link to="/inquiries" className="inline-flex items-center gap-1 hover:underline"><ChevronLeft className="h-4 w-4" aria-hidden />{s.title}</Link>
        {query.data && <><span aria-hidden>/</span><Link to={back} className="hover:underline">{query.data.inquiry_code}</Link></>}
      </nav>
      <PageHeader title={id ? s.editTitle : s.addTitle} subtitle={id ? s.editSub : s.addSub} />
      {id && query.isPending ? <Spinner /> : id && query.isError ? <ErrorNote error={query.error} onRetry={() => void query.refetch()} /> : (
        <div className="glass-panel p-4 md:p-6">
          <InquiryForm initial={query.data} defaultBuyerId={params.get('buyer') ?? undefined} onCancel={() => navigate(back)} onSaved={(saved) => navigate(`/inquiries/${saved.id}`)} />
        </div>
      )}
    </div>
  );
}
