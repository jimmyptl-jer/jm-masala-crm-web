/**
 * Daily rates page (route /daily-rates): the quickest way to the price list. Every product with its grades listed below it, the USD and INR
 * price per kg of each grade, editable by an administrator (components/products/DailyRates.tsx). The same table is the Daily rates tab of the
 * dashboard and of the Products page.
 */
import { DailyRates } from '@/components/products/DailyRates';
import { PageHeader } from '@/components/ui';
import { t } from '@/strings';

export default function DailyRatesPage() {
  return (
    <div className="space-y-4">
      <PageHeader title={t.products.dailyTitle} subtitle={t.products.dailyPageSub} />
      <DailyRates />
    </div>
  );
}
