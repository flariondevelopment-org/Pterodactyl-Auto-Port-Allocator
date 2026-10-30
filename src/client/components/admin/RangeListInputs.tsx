import { Button } from '@pterodactyl/sdk';
import { Trash2 } from 'lucide-react';
import type { PortRange } from '../../types/admin';

interface RangeListInputsProps {
    ranges: PortRange[];
    onUpdate: (index: number, field: 'start' | 'end', value: string) => void;
    onRemove: (index: number) => void;
    startPlaceholder?: string;
    endPlaceholder?: string;
    required?: boolean;
}

export function RangeListInputs({
    ranges,
    onUpdate,
    onRemove,
    startPlaceholder = 'Start port',
    endPlaceholder = 'End port',
    required = false,
}: RangeListInputsProps) {
    return (
        <div className={'apa:space-y-2'}>
            {ranges.map((range, idx) => (
                <div key={idx} className={'apa:flex apa:items-center apa:gap-2'}>
                    <input
                        type={'number'}
                        value={range.start}
                        onChange={(e) => onUpdate(idx, 'start', e.target.value)}
                        placeholder={startPlaceholder}
                        className={'apa:w-1/2 apa:rounded apa:border apa:border-muted apa:bg-background apa:p-2 apa:text-sm'}
                        required={required}
                    />
                    <span className={'apa:text-muted-foreground apa:text-xs'}>to</span>
                    <input
                        type={'number'}
                        value={range.end}
                        onChange={(e) => onUpdate(idx, 'end', e.target.value)}
                        placeholder={endPlaceholder}
                        className={'apa:w-1/2 apa:rounded apa:border apa:border-muted apa:bg-background apa:p-2 apa:text-sm'}
                        required={required}
                    />
                    {ranges.length > 1 && (
                        <Button
                            size={'xsmall'}
                            color={'red'}
                            type={'button'}
                            onClick={() => onRemove(idx)}
                            title={'Remove Range'}
                            className={'apa:p-1.5'}
                        >
                            <Trash2 className={'apa:w-3.5 apa:h-3.5'} />
                        </Button>
                    )}
                </div>
            ))}
        </div>
    );
}
