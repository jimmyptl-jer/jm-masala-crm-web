/**
 * Add / edit a product as a full page: /products/new and /products/:name/edit (see web/src/router.tsx).
 * Hosts ProductForm (which saves every grade of the product together) and sends the user back to the product's
 * page after saving, or to the list after adding / archiving. Admin only (RequireAdmin in the router; the API
 * also answers 403). API calls are made by ProductForm.
 */
import { ChevronLeft } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ProductForm } from '@/components/products/ProductForm';
import { PageHeader } from '@/components/ui';
import { t } from '@/strings';

const s = t.products;

/** The edit page. The product name comes from the URL (undefined on /products/new). */
export default function ProductEdit() {
  const { name } = useParams();
  const navigate = useNavigate();
  const product = name ? decodeURIComponent(name) : undefined;
  const back = product ? `/products/${encodeURIComponent(product)}` : '/products';
  return (
    <div className="space-y-4">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm text-slate-600">
        <Link to="/products" className="inline-flex items-center gap-1 hover:underline"><ChevronLeft className="h-4 w-4" aria-hidden />{s.title}</Link>
        {product && <><span aria-hidden>/</span><Link to={back} className="hover:underline">{product}</Link></>}
      </nav>
      <PageHeader title={product ? `${s.editTitle}: ${product}` : s.addProductTitle} subtitle={product ? s.editProductSub : s.addProductSub} />
      <div className="glass-panel p-4 md:p-6">
        <ProductForm
          name={product}
          onCancel={() => navigate(back)}
          // after a save go back to the product; after adding (or archiving) the product may not exist by that name yet, so go to the list
          onSaved={() => navigate(product ? back : '/products')}
        />
      </div>
    </div>
  );
}
