// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from '@testing-library/react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { axe } from '@/lib/test-axe';
import { COUNT_COMMIT_MS, ModelTable } from './ModelTable';
import { MAX_MODEL_COUNT } from '@/lib/validate';
import type { Model } from '@/types';

afterEach(() => { cleanup(); vi.useRealTimers(); });

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

  it('saves a settled draft after a pause, without waiting for blur (spinner and arrow keys)', () => {
    vi.useFakeTimers();
    const { onUpdateModel } = setup([model()]);
    fireEvent.change(input(), { target: { value: '4' } });
    act(() => { vi.advanceTimersByTime(COUNT_COMMIT_MS - 1); });
    expect(onUpdateModel).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1); });
    expect(onUpdateModel).toHaveBeenCalledWith(expect.objectContaining({ count: 4 }));
    expect(input().value).toBe('4'); // still editing: the draft is not reset mid-typing
  });

  it('does not save an invalid draft after a pause', () => {
    vi.useFakeTimers();
    const { onUpdateModel } = setup([model()]);
    fireEvent.change(input(), { target: { value: '' } });
    act(() => { vi.advanceTimersByTime(COUNT_COMMIT_MS * 2); });
    expect(onUpdateModel).not.toHaveBeenCalled();
  });

  it('drops a stale draft when the count changes from outside', () => {
    const onUpdateModel = vi.fn();
    const props = { projectId: 'p1', onAddModel: vi.fn(), onUpdateModel, onDeleteModel: vi.fn(), onToggleStatus: vi.fn() };
    const { rerender } = render(<ModelTable {...props} models={[model()]} />);
    fireEvent.change(input(), { target: { value: '7' } });
    rerender(<ModelTable {...props} models={[model({ count: 20 })]} />); // another tab saved 20
    expect(input().value).toBe('20');
    fireEvent.blur(input());
    expect(onUpdateModel).not.toHaveBeenCalled();
  });

  it('shows the capped value after a pause-commit, and saves once when blurred afterwards', () => {
    vi.useFakeTimers();
    const onUpdateModel = vi.fn();
    const props = { projectId: 'p1', onAddModel: vi.fn(), onUpdateModel, onDeleteModel: vi.fn(), onToggleStatus: vi.fn() };
    const { rerender } = render(<ModelTable {...props} models={[model()]} />);
    fireEvent.change(input(), { target: { value: '500' } });
    act(() => { vi.advanceTimersByTime(COUNT_COMMIT_MS); });
    expect(onUpdateModel).toHaveBeenCalledTimes(1);
    expect(onUpdateModel).toHaveBeenCalledWith(expect.objectContaining({ count: MAX_MODEL_COUNT }));
    expect(input().value).toBe(String(MAX_MODEL_COUNT));
    rerender(<ModelTable {...props} models={[model({ count: MAX_MODEL_COUNT })]} />); // the save lands
    fireEvent.blur(input());
    expect(onUpdateModel).toHaveBeenCalledTimes(1);
  });

  it('Escape undoes an edit that a pause already saved', () => {
    vi.useFakeTimers();
    const onUpdateModel = vi.fn();
    const props = { projectId: 'p1', onAddModel: vi.fn(), onUpdateModel, onDeleteModel: vi.fn(), onToggleStatus: vi.fn() };
    const { rerender } = render(<ModelTable {...props} models={[model()]} />);
    fireEvent.change(input(), { target: { value: '5' } });
    act(() => { vi.advanceTimersByTime(COUNT_COMMIT_MS); });
    rerender(<ModelTable {...props} models={[model({ count: 5 })]} />); // the save lands
    fireEvent.keyDown(input(), { key: 'Escape' });
    expect(onUpdateModel).toHaveBeenLastCalledWith(expect.objectContaining({ count: 3 }));
  });

  it('drops a draft when another tab sets the count back to what this field last saved', () => {
    const onUpdateModel = vi.fn();
    const props = { projectId: 'p1', onAddModel: vi.fn(), onUpdateModel, onDeleteModel: vi.fn(), onToggleStatus: vi.fn() };
    const { rerender } = render(<ModelTable {...props} models={[model({ count: 1 })]} />);
    fireEvent.change(input(), { target: { value: '1' } });
    fireEvent.blur(input()); // saved stays 1
    rerender(<ModelTable {...props} models={[model({ count: 7 })]} />); // another tab: 7
    fireEvent.change(input(), { target: { value: '9' } });
    rerender(<ModelTable {...props} models={[model({ count: 1 })]} />); // another tab: back to 1
    expect(input().value).toBe('1');
    fireEvent.blur(input());
    expect(onUpdateModel).not.toHaveBeenCalled();
  });
});
