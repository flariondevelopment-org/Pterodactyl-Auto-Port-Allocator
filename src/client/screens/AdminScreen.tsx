import { useEffect, useState } from 'react';
import {
    Alert,
    Badge,
    Button,
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
    description?: string | null;
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

const RESERVED_VARIABLES = [
    'SERVER_PORT',
    'SERVER_MEMORY',
    'SERVER_IP',
    'ENV',
    'HOME',
    'USER',
    'STARTUP',
    'SERVER_UUID',
    'UUID',
];

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
    const [selectedVarOption, setSelectedVarOption] = useState<string>('');
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

    const currentEgg = eggs.find((e) => e.id === Number(selectedEggId));
    const eggVariables = currentEgg?.variables || [];

    const handleEggChange = (eggId: number | '') => {
        setSelectedEggId(eggId);
        setSelectedVarOption('');
        setEnvVariable('');
        setRuleName('');
    };

    const handleVariableSelect = (value: string) => {
        setSelectedVarOption(value);
        if (value && value !== '__CUSTOM__') {
            const matchedVar = eggVariables.find((v) => v.env_variable === value);
            setEnvVariable(value);
            if (matchedVar) {
                setRuleName(matchedVar.name);
            }
        } else if (value === '__CUSTOM__') {
            setEnvVariable('');
        }
    };

    const isReservedVar = RESERVED_VARIABLES.includes(envVariable.trim().toUpperCase());
    const isServerPort = envVariable.trim().toUpperCase() === 'SERVER_PORT';

    const handleCreateRule = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmedVar = envVariable.trim().toUpperCase();

        if (!selectedEggId || !ruleName.trim() || !trimmedVar) {
            toast.error('Please fill in all required rule fields.');
            return;
        }

        if (isServerPort) {
            toast.error("SERVER_PORT is the server's default port. Create sub-rules for additional variables (e.g. RCON_PORT).");
            return;
        }

        if (isReservedVar) {
            toast.error(`The variable ${trimmedVar} is reserved by Pterodactyl.`);
            return;
        }

        try {
            setSubmitting(true);
            const payload = {
                egg_id: Number(selectedEggId),
                name: ruleName.trim(),
                env_variable: trimmedVar,
                allocation_type: allocationType,
                offset_value: allocationType === 'offset' ? Number(offsetValue) : null,
                range_start: allocationType === 'range' ? Number(rangeStart) : null,
                range_end: allocationType === 'range' ? Number(rangeEnd) : null,
                auto_create_allocation: autoCreate,
                is_required: isRequired,
            };

            const response = await http.post('/api/admin/extensions/auto-port-allocator/rules', payload);
            setRules((prev) => [...prev, response.data.rule]);
            toast.success('Port sub-rule created successfully!');

            // Reset form fields
            setRuleName('');
            setEnvVariable('');
            setSelectedVarOption('');
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

                {/* Sub-Rule Concept Notice */}
                <div className={'apa:rounded-lg apa:border apa:border-muted apa:bg-card apa:p-4 apa:text-sm'}>
                    <div className={'apa:flex apa:items-start apa:gap-3'}>
                        <div className={'apa:font-bold apa:text-primary apa:text-base'}>ℹ️</div>
                        <div className={'apa:space-y-1'}>
                            <p className={'apa:font-semibold apa:text-foreground'}>
                                Primary Port vs. Port Sub-Rules Architecture
                            </p>
                            <p className={'apa:text-muted-foreground apa:text-xs'}>
                                In Pterodactyl, the server's default port is always bound to the primary allocation and exposed as{' '}
                                <code className={'apa:bg-muted apa:px-1.5 apa:py-0.5 apa:rounded apa:text-foreground apa:font-mono'}>SERVER_PORT</code>.
                                The rules defined below act as <strong>Sub-Rules</strong> to automatically allocate secondary ports
                                (e.g. RCON, Query, App, Web HTTP) and bind their allocated port number into the target egg variable
                                (e.g. <code className={'apa:bg-muted apa:px-1.5 apa:py-0.5 apa:rounded apa:text-foreground apa:font-mono'}>RCON_PORT</code>).
                            </p>
                        </div>
                    </div>
                </div>

                {/* Create New Sub-Rule Box */}
                <TitledGreyBox title={'Define New Port Sub-Rule'}>
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
                                        handleEggChange(id);
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

                            {/* Variable Picker / Input */}
                            <div>
                                <label className={'apa:block apa:text-xs apa:font-medium apa:text-muted-foreground apa:mb-1'}>
                                    Target Egg Environment Variable
                                </label>
                                {eggVariables.length > 0 ? (
                                    <div className={'apa:space-y-2'}>
                                        <select
                                            value={selectedVarOption}
                                            onChange={(e) => handleVariableSelect(e.target.value)}
                                            className={'apa:w-full apa:rounded apa:border apa:border-muted apa:bg-background apa:p-2 apa:text-sm apa:font-mono'}
                                            required
                                        >
                                            <option value={''}>Select an Egg Variable...</option>
                                            {eggVariables.map((v) => (
                                                <option key={v.id} value={v.env_variable}>
                                                    {v.env_variable} — {v.name}
                                                </option>
                                            ))}
                                            <option value={'__CUSTOM__'}>+ Custom Variable Name...</option>
                                        </select>
                                        {selectedVarOption === '__CUSTOM__' && (
                                            <input
                                                type={'text'}
                                                value={envVariable}
                                                onChange={(e) => setEnvVariable(e.target.value.toUpperCase())}
                                                placeholder={'e.g. RCON_PORT, HTTP_PORT'}
                                                className={'apa:w-full apa:rounded apa:border apa:border-muted apa:bg-background apa:p-2 apa:text-sm apa:font-mono'}
                                                required
                                            />
                                        )}
                                    </div>
                                ) : (
                                    <input
                                        type={'text'}
                                        value={envVariable}
                                        onChange={(e) => setEnvVariable(e.target.value.toUpperCase())}
                                        placeholder={'e.g. RCON_PORT, HTTP_PORT, APP_PORT'}
                                        className={'apa:w-full apa:rounded apa:border apa:border-muted apa:bg-background apa:p-2 apa:text-sm apa:font-mono'}
                                        required
                                    />
                                )}
                            </div>

                            {/* Rule / Role Name */}
                            <div>
                                <label className={'apa:block apa:text-xs apa:font-medium apa:text-muted-foreground apa:mb-1'}>
                                    Sub-Rule / Service Name
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
                        </div>

                        {/* Inline Reserved Variable Warning */}
                        {isServerPort && (
                            <div className={'apa:rounded apa:p-3 apa:text-xs apa:bg-destructive/10 apa:text-destructive apa:border apa:border-destructive/20'}>
                                ⚠️ <strong>SERVER_PORT</strong> cannot be configured as a rule. It is the server's default primary allocation.
                                Please select or enter an additional port variable (such as <code className={'apa:font-mono'}>RCON_PORT</code> or <code className={'apa:font-mono'}>APP_PORT</code>).
                            </div>
                        )}

                        {isReservedVar && !isServerPort && (
                            <div className={'apa:rounded apa:p-3 apa:text-xs apa:bg-destructive/10 apa:text-destructive apa:border apa:border-destructive/20'}>
                                ⚠️ <strong>{envVariable}</strong> is a reserved Pterodactyl variable and cannot be used for port sub-rules.
                            </div>
                        )}

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
                                    <option value={'offset'}>Fixed Offset from SERVER_PORT (e.g. Primary + 2)</option>
                                    <option value={'any_available'}>Any Free Port on Node / IP</option>
                                    <option value={'range'}>Port Range / Pool</option>
                                </select>
                            </div>

                            {/* Type-Specific Options */}
                            {allocationType === 'offset' && (
                                <div>
                                    <label className={'apa:block apa:text-xs apa:font-medium apa:text-muted-foreground apa:mb-1'}>
                                        Offset from SERVER_PORT
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
                                        Calculated as: <code className={'apa:font-mono'}>SERVER_PORT + {offsetValue}</code> (e.g. 22003 + 2 = 22005)
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
                                    <span>Auto-create on node</span>
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
                            <Button type={'submit'} isLoading={submitting} disabled={isReservedVar}>
                                Add Sub-Rule
                            </Button>
                        </div>
                    </form>
                </TitledGreyBox>

                {/* Existing Rules List */}
                <TitledGreyBox title={'Configured Egg Port Sub-Rules'}>
                    {rules.length === 0 ? (
                        <p className={'apa:p-4 apa:text-sm apa:text-muted-foreground'}>
                            No egg port sub-rules configured yet. Select an Egg above to configure additional ports (e.g. for Rust or MTA).
                        </p>
                    ) : (
                        <div className={'apa:overflow-x-auto'}>
                            <table className={'apa:w-full apa:text-left apa:border-collapse'}>
                                <thead>
                                    <tr className={'apa:border-b apa:border-muted apa:text-xs apa:text-muted-foreground apa:uppercase'}>
                                        <th className={'apa:py-3 apa:px-4'}>Target Egg</th>
                                        <th className={'apa:py-3 apa:px-4'}>Service Name</th>
                                        <th className={'apa:py-3 apa:px-4'}>Sub-Rule Variable</th>
                                        <th className={'apa:py-3 apa:px-4'}>Strategy</th>
                                        <th className={'apa:py-3 apa:px-4'}>Formula / Config</th>
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
                                            <td className={'apa:py-3 apa:px-4'}>
                                                <div className={'apa:flex apa:items-center apa:gap-2'}>
                                                    <span className={'apa:font-mono apa:text-sm apa:text-primary apa:font-semibold'}>
                                                        {rule.env_variable}
                                                    </span>
                                                    <Badge tone={'accent'} variant={'soft'}>Sub-Rule</Badge>
                                                </div>
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
                                                {rule.allocation_type === 'offset' && (
                                                    <span className={'apa:text-foreground'}>SERVER_PORT + {rule.offset_value}</span>
                                                )}
                                                {rule.allocation_type === 'range' && (
                                                    <span>{rule.range_start}-{rule.range_end}</span>
                                                )}
                                                {rule.allocation_type === 'any_available' && (
                                                    <span className={'apa:text-muted-foreground'}>Any Free Port</span>
                                                )}
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