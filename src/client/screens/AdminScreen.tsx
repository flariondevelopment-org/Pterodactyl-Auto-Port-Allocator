import { useEffect, useState } from 'react';
import {
    Alert,
    Badge,
    Button,
    Card,
    http,
    httpErrorToHuman,
    PageContentBlock,
    Spinner,
    TitledGreyBox,
    toast,
} from '@pterodactyl/sdk';

interface EggVariable {
    id: number;
    egg_id: number;
    name: string;
    env_variable: string;
    default_value: string;
}

interface Egg {
    id: number;
    nest_id: number;
    name: string;
    author: string;
    variables: EggVariable[];
}

interface PortRule {
    id: number;
    egg_id: number;
    name: string;
    env_variable: string;
    allocation_type: 'offset' | 'any_available' | 'range';
    offset_value: number | null;
    range_start: number | null;
    range_end: number | null;
    auto_create_allocation: boolean;
    is_required: boolean;
    egg?: {
        id: number;
        name: string;
    };
}

export default function AdminScreen() {
    const [rules, setRules] = useState<PortRule[]>([]);
    const [eggs, setEggs] = useState<Egg[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Form state
    const [selectedEggId, setSelectedEggId] = useState<number | ''>('');
    const [ruleName, setRuleName] = useState('');
    const [envVariable, setEnvVariable] = useState('');
    const [allocationType, setAllocationType] = useState<'offset' | 'any_available' | 'range'>('offset');
    const [offsetValue, setOffsetValue] = useState<number>(1);
    const [rangeStart, setRangeStart] = useState<number>(28000);
    const [rangeEnd, setRangeEnd] = useState<number>(28100);
    const [autoCreate, setAutoCreate] = useState(true);
    const [isRequired, setIsRequired] = useState(true);

    const loadData = async () => {
        try {
            setError(null);
            const [rulesRes, eggsRes] = await Promise.all([
                http.get('/api/admin/extensions/auto-port-allocator/rules'),
                http.get('/api/admin/extensions/auto-port-allocator/eggs'),
            ]);
            setRules(rulesRes.data.rules || []);
            setEggs(eggsRes.data.eggs || []);
        } catch (err) {
            setError(httpErrorToHuman(err));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const handleCreateRule = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedEggId || !ruleName.trim() || !envVariable.trim()) {
            toast.error('Please fill in all required rule fields.');
            return;
        }

        try {
            setSubmitting(true);
            const payload = {
                egg_id: Number(selectedEggId),
                name: ruleName.trim(),
                env_variable: envVariable.trim(),
                allocation_type: allocationType,
                offset_value: allocationType === 'offset' ? Number(offsetValue) : null,
                range_start: allocationType === 'range' ? Number(rangeStart) : null,
                range_end: allocationType === 'range' ? Number(rangeEnd) : null,
                auto_create_allocation: autoCreate,
                is_required: isRequired,
            };

            const response = await http.post('/api/admin/extensions/auto-port-allocator/rules', payload);
            setRules((prev) => [...prev, response.data.rule]);
            toast.success('Port rule created successfully!');

            // Reset form fields
            setRuleName('');
            setEnvVariable('');
            setOffsetValue(1);
        } catch (err) {
            toast.error(httpErrorToHuman(err));
        } finally {
            setSubmitting(false);
        }
    };

    const handleDeleteRule = async (ruleId: number) => {
        if (!window.confirm('Are you sure you want to delete this port allocation rule?')) {
            return;
        }

        try {
            await http.delete(`/api/admin/extensions/auto-port-allocator/rules/${ruleId}`);
            setRules((prev) => prev.filter((r) => r.id !== ruleId));
            toast.success('Rule deleted.');
        } catch (err) {
            toast.error(httpErrorToHuman(err));
        }
    };

    if (loading) {
        return (
            <PageContentBlock title={'Auto Port Allocator Configuration'}>
                <div className={'apa:flex apa:justify-center apa:items-center apa:p-12'}>
                    <Spinner size={'large'} />
                </div>
            </PageContentBlock>
        );
    }

    return (
        <PageContentBlock title={'Auto Port Allocator Configuration'}>
            <div className={'apa:space-y-8'}>
                {error && <Alert type={'danger'}>{error}</Alert>}

                {/* Create New Rule Box */}
                <TitledGreyBox title={'Define New Egg Port Rule'}>
                    <form onSubmit={handleCreateRule} className={'apa:space-y-4 apa:p-2'}>
                        <div className={'apa:grid apa:grid-cols-1 md:apa:grid-cols-3 apa:gap-4'}>
                            {/* Target Egg */}
                            <div>
                                <label className={'apa:block apa:text-xs apa:font-medium apa:text-muted-foreground apa:mb-1'}>
                                    Target Egg
                                </label>
                                <select
                                    value={selectedEggId}
                                    onChange={(e) => {
                                        const id = e.target.value ? Number(e.target.value) : '';
                                        setSelectedEggId(id);
                                    }}
                                    className={'apa:w-full apa:rounded apa:border apa:border-muted apa:bg-background apa:p-2 apa:text-sm'}
                                    required
                                >
                                    <option value={''}>Select an Egg...</option>
                                    {eggs.map((egg) => (
                                        <option key={egg.id} value={egg.id}>
                                            {egg.name} (Egg #{egg.id})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Rule / Role Name */}
                            <div>
                                <label className={'apa:block apa:text-xs apa:font-medium apa:text-muted-foreground apa:mb-1'}>
                                    Rule / Service Name
                                </label>
                                <input
                                    type={'text'}
                                    value={ruleName}
                                    onChange={(e) => setRuleName(e.target.value)}
                                    placeholder={'e.g. RCON Port, MTA HTTP, Rust+ App'}
                                    className={'apa:w-full apa:rounded apa:border apa:border-muted apa:bg-background apa:p-2 apa:text-sm'}
                                    required
                                />
                            </div>

                            {/* Environment Variable */}
                            <div>
                                <label className={'apa:block apa:text-xs apa:font-medium apa:text-muted-foreground apa:mb-1'}>
                                    Environment Variable Key
                                </label>
                                <input
                                    type={'text'}
                                    value={envVariable}
                                    onChange={(e) => setEnvVariable(e.target.value.toUpperCase())}
                                    placeholder={'e.g. RCON_PORT, HTTP_PORT, APP_PORT'}
                                    className={'apa:w-full apa:rounded apa:border apa:border-muted apa:bg-background apa:p-2 apa:text-sm apa:font-mono'}
                                    required
                                />
                            </div>
                        </div>

                        <div className={'apa:grid apa:grid-cols-1 md:apa:grid-cols-3 apa:gap-4'}>
                            {/* Allocation Type */}
                            <div>
                                <label className={'apa:block apa:text-xs apa:font-medium apa:text-muted-foreground apa:mb-1'}>
                                    Allocation Strategy
                                </label>
                                <select
                                    value={allocationType}
                                    onChange={(e) => setAllocationType(e.target.value as any)}
                                    className={'apa:w-full apa:rounded apa:border apa:border-muted apa:bg-background apa:p-2 apa:text-sm'}
                                >
                                    <option value={'offset'}>Fixed Offset from Primary Port (e.g. Primary + 2)</option>
                                    <option value={'any_available'}>Any Free Port on Node / IP</option>
                                    <option value={'range'}>Port Range / Pool</option>
                                </select>
                            </div>

                            {/* Type-Specific Options */}
                            {allocationType === 'offset' && (
                                <div>
                                    <label className={'apa:block apa:text-xs apa:font-medium apa:text-muted-foreground apa:mb-1'}>
                                        Offset Value (Added to Primary Port)
                                    </label>
                                    <input
                                        type={'number'}
                                        value={offsetValue}
                                        onChange={(e) => setOffsetValue(Number(e.target.value))}
                                        placeholder={'e.g. 1, 2, 123'}
                                        className={'apa:w-full apa:rounded apa:border apa:border-muted apa:bg-background apa:p-2 apa:text-sm'}
                                        required
                                    />
                                    <p className={'apa:text-xs apa:text-muted-foreground apa:mt-1'}>
                                        Example: MTA HTTP = 2 (22003 + 2 = 22005)
                                    </p>
                                </div>
                            )}

                            {allocationType === 'range' && (
                                <div className={'apa:flex apa:gap-2'}>
                                    <div>
                                        <label className={'apa:block apa:text-xs apa:font-medium apa:text-muted-foreground apa:mb-1'}>
                                            Range Start
                                        </label>
                                        <input
                                            type={'number'}
                                            value={rangeStart}
                                            onChange={(e) => setRangeStart(Number(e.target.value))}
                                            className={'apa:w-full apa:rounded apa:border apa:border-muted apa:bg-background apa:p-2 apa:text-sm'}
                                        />
                                    </div>
                                    <div>
                                        <label className={'apa:block apa:text-xs apa:font-medium apa:text-muted-foreground apa:mb-1'}>
                                            Range End
                                        </label>
                                        <input
                                            type={'number'}
                                            value={rangeEnd}
                                            onChange={(e) => setRangeEnd(Number(e.target.value))}
                                            className={'apa:w-full apa:rounded apa:border apa:border-muted apa:bg-background apa:p-2 apa:text-sm'}
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Checkbox settings */}
                            <div className={'apa:flex apa:items-center apa:gap-4 apa:pt-6'}>
                                <label className={'apa:flex apa:items-center apa:gap-2 apa:text-sm'}>
                                    <input
                                        type={'checkbox'}
                                        checked={autoCreate}
                                        onChange={(e) => setAutoCreate(e.target.checked)}
                                        className={'apa:rounded'}
                                    />
                                    <span>Auto-create port on node if missing</span>
                                </label>
                                <label className={'apa:flex apa:items-center apa:gap-2 apa:text-sm'}>
                                    <input
                                        type={'checkbox'}
                                        checked={isRequired}
                                        onChange={(e) => setIsRequired(e.target.checked)}
                                        className={'apa:rounded'}
                                    />
                                    <span>Strictly Required</span>
                                </label>
                            </div>
                        </div>

                        <div className={'apa:flex apa:justify-end apa:pt-2'}>
                            <Button type={'submit'} isLoading={submitting}>
                                Add Port Rule
                            </Button>
                        </div>
                    </form>
                </TitledGreyBox>

                {/* Existing Rules List */}
                <TitledGreyBox title={'Configured Port Rules'}>
                    {rules.length === 0 ? (
                        <p className={'apa:p-4 apa:text-sm apa:text-muted-foreground'}>
                            No egg port allocation rules configured yet. Create one above (e.g. for Rust or MTA).
                        </p>
                    ) : (
                        <div className={'apa:overflow-x-auto'}>
                            <table className={'apa:w-full apa:text-left apa:border-collapse'}>
                                <thead>
                                    <tr className={'apa:border-b apa:border-muted apa:text-xs apa:text-muted-foreground apa:uppercase'}>
                                        <th className={'apa:py-3 apa:px-4'}>Target Egg</th>
                                        <th className={'apa:py-3 apa:px-4'}>Service Name</th>
                                        <th className={'apa:py-3 apa:px-4'}>Env Variable</th>
                                        <th className={'apa:py-3 apa:px-4'}>Strategy</th>
                                        <th className={'apa:py-3 apa:px-4'}>Config</th>
                                        <th className={'apa:py-3 apa:px-4'}>Auto-Create</th>
                                        <th className={'apa:py-3 apa:px-4'}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody className={'apa:divide-y apa:divide-muted'}>
                                    {rules.map((rule) => (
                                        <tr key={rule.id} className={'apa:hover:bg-muted/30'}>
                                            <td className={'apa:py-3 apa:px-4 apa:font-medium'}>
                                                {rule.egg?.name || `Egg #${rule.egg_id}`}
                                            </td>
                                            <td className={'apa:py-3 apa:px-4'}>{rule.name}</td>
                                            <td className={'apa:py-3 apa:px-4 apa:font-mono apa:text-sm apa:text-primary'}>
                                                {rule.env_variable}
                                            </td>
                                            <td className={'apa:py-3 apa:px-4'}>
                                                <Badge tone={'neutral'} variant={'soft'}>
                                                    {rule.allocation_type === 'offset'
                                                        ? 'Fixed Offset'
                                                        : rule.allocation_type === 'range'
                                                          ? 'Range'
                                                          : 'Any Available'}
                                                </Badge>
                                            </td>
                                            <td className={'apa:py-3 apa:px-4 apa:font-mono apa:text-sm'}>
                                                {rule.allocation_type === 'offset' && `+${rule.offset_value}`}
                                                {rule.allocation_type === 'range' && `${rule.range_start}-${rule.range_end}`}
                                                {rule.allocation_type === 'any_available' && 'Any Free'}
                                            </td>
                                            <td className={'apa:py-3 apa:px-4'}>
                                                {rule.auto_create_allocation ? (
                                                    <span className={'apa:text-success apa:text-xs apa:font-medium'}>Yes</span>
                                                ) : (
                                                    <span className={'apa:text-muted-foreground apa:text-xs'}>No</span>
                                                )}
                                            </td>
                                            <td className={'apa:py-3 apa:px-4'}>
                                                <button
                                                    onClick={() => handleDeleteRule(rule.id)}
                                                    className={'apa:text-destructive apa:text-xs apa:font-medium apa:hover:underline'}
                                                >
                                                    Delete
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </TitledGreyBox>
            </div>
        </PageContentBlock>
    );
}
