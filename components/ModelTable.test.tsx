// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { axe } from '@/lib/test-axe';
import { ModelTable } from './ModelTable';
import { MAX_MODEL_COUNT } from '@/lib/validate';
import type { Model } from '@/types';

afterEach(cleanup);

const model = (over: Partial<Model> = {}): Model => ({
  id: 'm1', projectId: 'p1', name: 'Captain', count: 3,
  built: false, primed: false, painted: false, based: false, ...over,
});
const done = { built: true, primed: true, painted: true, based: true };

function setup(models: Model[]) {
  const onUpdateModel = vi.fn();
  render(
    <ModelTable
      projectId="p1"
      models={models}
      onAddModel={vi.fn()}
      onUpdateModel={onUpdateModel}
      onDeleteModel={vi.fn()}
      onToggleStatus={vi.fn()}
    />,
  );
  return { onUpdateModel };
}

const cellOf = (label: RegExp) => screen.getByRole('checkbox', { name: label }).closest('td')!;

describe('ModelTable status colours', () => {
  it('tints ticked cells green and unticked cells red', () => {
    setup([model({ built: true })]);
    expect(cellOf(/built - captain/i).className).toContain('bg-green-600/40');
    expect(cellOf(/primed - captain/i).className).toContain('bg-red-800/40');
  });

  it('tints the whole row green only when all four stages are ticked', () => {
    setup([model({ ...done, based: false })]);
    const nameCell = screen.getByLabelText('Name of Captain').closest('td')!;
    expect(nameCell.className).not.toContain('bg-green-600/40');
    cleanup();

    setup([model(done)]);
    expect(screen.getByLabelText('Name of Captain').closest('td')!.className).toContain('bg-green-600/40');
    expect(screen.getByLabelText('Count for Captain').closest('td')!.className).toContain('bg-green-600/40');
    expect(screen.getByRole('button', { name: 'Delete model Captain' }).closest('td')!.className).toContain('bg-green-600/40');
  });

  it('keeps a light checkbox border so the box stands out from either tint', () => {
    setup([model({ built: true })]);
    const box = (label: RegExp) => screen.getByRole('checkbox', { name: label }).nextElementSibling!;
    expect(box(/built - captain/i).className).toContain('border-zinc-100');
    expect(box(/primed - captain/i).className).toContain('border-zinc-300');
  });

  it('has no axe violations', async () => {
    setup([model(done)]);
    const results = await axe(document.body, {
      // jsdom cannot compute colours, and the table is rendered outside the app's landmarks
      rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });
});

describe('ModelTable count input', () => {
  const input = () => screen.getByLabelText('Count for Captain') as HTMLInputElement;
  const typeAndBlur = (value: string) => {
    fireEvent.change(input(), { target: { value } });
    fireEvent.blur(input());
  };

  it('can be cleared and retyped without committing until blur', () => {
    const { onUpdateModel } = setup([model()]);
    fireEvent.change(input(), { target: { value: '' } });
    expect(input().value).toBe('');
    fireEvent.change(input(), { target: { value: '12' } });
    expect(onUpdateModel).not.toHaveBeenCalled();
    fireEvent.blur(input());
    expect(onUpdateModel).toHaveBeenCalledWith(expect.objectContaining({ count: 12 }));
  });

  it('commits on Enter', () => {
    const { onUpdateModel } = setup([model()]);
    fireEvent.change(input(), { target: { value: '5' } });
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(onUpdateModel).toHaveBeenCalledWith(expect.objectContaining({ count: 5 }));
  });

  it('reverts on Escape', () => {
    const { onUpdateModel } = setup([model()]);
    fireEvent.change(input(), { target: { value: '8' } });
    fireEvent.keyDown(input(), { key: 'Escape' });
    expect(input().value).toBe('3');
    expect(onUpdateModel).not.toHaveBeenCalled();
  });

  it.each([['empty', ''], ['exponent', '1e3'], ['negative', '-2'], ['decimal', '2.5']])(
    'reverts an invalid value (%s)',
    (_n, value) => {
      const { onUpdateModel } = setup([model()]);
      typeAndBlur(value);
      expect(onUpdateModel).not.toHaveBeenCalled();
      expect(input().value).toBe('3');
    },
  );

  it('raises 0 to 1 and caps large values', () => {
    const { onUpdateModel } = setup([model()]);
    typeAndBlur('0');
    expect(onUpdateModel).toHaveBeenLastCalledWith(expect.objectContaining({ count: 1 }));
    typeAndBlur('999999');
    expect(onUpdateModel).toHaveBeenLastCalledWith(expect.objectContaining({ count: MAX_MODEL_COUNT }));
  });
});
