/**
 * Add / edit a sample as a full page: /samples/new (optionally ?buyer=<id>) and /samples/:id/edit (see router.tsx).
 * Hosts SampleForm and sends the user to the sample's page after saving. API: GET /samples/:id to load the sample being edited
 * (key ['sample', id]); saving is done by SampleForm.
 */
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft } from 'lucide-react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { SampleForm } from '@/components/samples/SampleForm';
import { ErrorNote, PageHeader, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import type { SampleDetail } from '@/lib/samples';
import { t } from '@/strings';

const s = t.samples;

export default function SampleEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const query = useQuery({ queryKey: ['sample', id], queryFn: () => api.get<SampleDetail>(`/samples/${id}`), enabled: !!id });
  const back = id ? `/samples/${id}` : '/samples';
  return (
    <div className="space-y-4">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm text-slate-600">
        <Link to="/samples" className="inline-flex items-center gap-1 hover:underline"><ChevronLeft className="h-4 w-4" aria-hidden />{s.title}</Link>
        {query.data && <><span aria-hidden>/</span><Link to={back} className="hover:underline">{query.data.sample_code}</Link></>}
      </nav>
      <PageHeader title={id ? s.editTitle : s.addTitle} subtitle={id ? s.editSub : s.addSub} />
      {id && query.isPending ? <Spinner /> : id && query.isError ? <ErrorNote error={query.error} onRetry={() => void query.refetch()} /> : (
        <div className="glass-panel p-4 md:p-6">
          <SampleForm initial={query.data} defaultBuyerId={params.get('buyer') ?? undefined} onCancel={() => navigate(back)} onSaved={(saved) => navigate(`/samples/${saved.id}`)} />
        </div>
      )}
    </div>
  );
}
