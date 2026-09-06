import { afterEach, expect, test } from 'bun:test';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import citizen from '../../messages/en/citizen.json';
import { startCase, workflows } from '@/lib/workflow';
import { CitizenHome } from './citizen-home';

afterEach(cleanup);

test('location changes filter the library but preserve saved cases in collapsed sections', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  client.setQueryData(['published-workflows'], [
    { id: 'scholarship', workflowVersionId: 'scholarship-v5', definition: workflows.scholarship, jurisdiction: { scope: 'central' } },
    { id: 'punjab-income', workflowVersionId: 'punjab-income-v1', definition: workflows['punjab-income'], jurisdiction: { scope: 'state', stateCode: 'PB' } },
  ]);
  render(<NextIntlClientProvider locale="en" messages={{ citizen }}>
    <NuqsTestingAdapter searchParams="?state=NL" hasMemory>
      <QueryClientProvider client={client}>
        <CitizenHome locale="en" feedback="" onStart={async () => {}} onResume={() => {}}
          savedCases={[{ id: 'synthetic-pb', workflowId: 'punjab-income', snapshot: startCase('punjab-income'), updatedAt: '2026-09-07T00:00:00Z' }]} />
      </QueryClientProvider>
    </NuqsTestingAdapter>
  </NextIntlClientProvider>);
  expect(screen.queryByRole('heading', { name: 'Punjab income certificate stuck' }) === null).toBe(true);
  expect(screen.getByRole('heading', { name: 'Stuck scholarship' })).toBeDefined();
  const savedSection = screen.getByText('Current and open cases').closest('details');
  expect(savedSection !== null).toBe(true);
  expect(savedSection?.open).toBe(false);
  expect(savedSection?.textContent).toContain('Punjab income certificate stuck');
  fireEvent.change(screen.getByLabelText('State or union territory'), { target: { value: 'PB' } });
  await screen.findByRole('heading', { name: 'Punjab income certificate stuck' });
  fireEvent.change(screen.getByLabelText('State or union territory'), { target: { value: 'NL' } });
  await waitFor(() => expect(screen.queryByRole('heading', { name: 'Punjab income certificate stuck' })).toBeNull());
});
