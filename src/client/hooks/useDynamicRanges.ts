import { useState } from 'react';
import type { PortRange } from '../types/admin';

export function useDynamicRanges(initial: PortRange[] = [{ start: '', end: '' }]) {
    const [ranges, setRanges] = useState<PortRange[]>(initial);

    const addRange = () => {
        setRanges((prev) => [...prev, { start: '', end: '' }]);
    };

    const removeRange = (index: number) => {
        setRanges((prev) => prev.filter((_, i) => i !== index));
    };

    const updateRange = (index: number, field: 'start' | 'end', value: string) => {
        setRanges((prev) =>
            prev.map((r, i) => {
                if (i !== index) return r;
                return {
                    ...r,
                    [field]: value === '' ? '' : Number(value),
                };
            })
        );
    };

    const resetRanges = (newRanges?: PortRange[]) => {
        setRanges(newRanges && newRanges.length > 0 ? newRanges : [{ start: '', end: '' }]);
    };

    return {
        ranges,
        setRanges,
        addRange,
        removeRange,
        updateRange,
        resetRanges,
    };
}
