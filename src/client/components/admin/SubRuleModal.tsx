import { useEffect, useState } from 'react';
import { Button, http, httpErrorToHuman, toast } from '@pterodactyl/sdk';
import { Plus } from 'lucide-react';
import { RangeListInputs } from './RangeListInputs';
import { useDynamicRanges } from '../../hooks/useDynamicRanges';
import type { Egg, EggVariable, GameProfile, SubRule } from '../../types/admin';
import { getProfileEggIds, RESERVED_VARIABLES } from '../../types/admin';
import { extractValidRanges } from '../../utils/ranges';

interface SubRuleModalProps {
    isOpen: boolean;
    activeProfile: GameProfile | null;
    editingSubRule: SubRule | null;
    eggs: Egg[];
    onClose: () => void;
    onSuccess: (subRule: SubRule, profileId: number, isEdit: boolean) => void;
}

export function SubRuleModal({
    isOpen,
    activeProfile,
    editingSubRule,
    eggs,
    onClose,
    onSuccess,
}: SubRuleModalProps) {
    const [subRuleName, setSubRuleName] = useState('');
    const [subRuleEnvVar, setSubRuleEnvVar] = useState('');
    const [subRuleVarOption, setSubRuleVarOption] = useState('');
    const [subRuleAllocType, setSubRuleAllocType] = useState<'offset' | 'any_available' | 'range'>('offset');
    const [subRuleOffset, setSubRuleOffset] = useState<number>(2);
    const [subRuleAutoCreate, setSubRuleAutoCreate] = useState(true);
    const [subRuleRequired, setSubRuleRequired] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    const {
        ranges: subRuleRanges,
        addRange: addSubRuleRange,
        removeRange: removeSubRuleRange,
        updateRange: updateSubRuleRange,
        resetRanges,
    } = useDynamicRanges([{ start: 28000, end: 28100 }]);

    const eggIds = activeProfile ? getProfileEggIds(activeProfile) : [];
    const activeLinkedEggs = eggs.filter((e) => eggIds.includes(e.id));

    const eggVariables: EggVariable[] = [];
    const seenVars = new Set<string>();
    for (const egg of activeLinkedEggs) {
        if (egg.variables) {
            for (const v of egg.variables) {
                if (!seenVars.has(v.env_variable) && !RESERVED_VARIABLES.includes(v.env_variable)) {
                    seenVars.add(v.env_variable);
                    eggVariables.push(v);
                }
            }
        }
    }

    useEffect(() => {
        if (!isOpen || !activeProfile) return;

        if (editingSubRule) {
            setSubRuleName(editingSubRule.name);
            setSubRuleEnvVar(editingSubRule.env_variable);
            setSubRuleVarOption(editingSubRule.env_variable);
            setSubRuleAllocType(editingSubRule.allocation_type);
            setSubRuleOffset(editingSubRule.offset_value ?? 2);
            if (editingSubRule.port_ranges && editingSubRule.port_ranges.length > 0) {
                resetRanges(editingSubRule.port_ranges.map((r) => ({ start: r.start, end: r.end })));
            } else if (editingSubRule.range_start && editingSubRule.range_end) {
                resetRanges([{ start: editingSubRule.range_start, end: editingSubRule.range_end }]);
            } else {
                resetRanges([{ start: 28000, end: 28100 }]);
            }
            setSubRuleAutoCreate(editingSubRule.auto_create_allocation);
            setSubRuleRequired(editingSubRule.is_required);
        } else {
            setSubRuleName('');
            setSubRuleEnvVar('');
            setSubRuleVarOption('');
            setSubRuleAllocType('offset');
            setSubRuleOffset(2);
            resetRanges([{ start: 28000, end: 28100 }]);
            setSubRuleAutoCreate(true);
            setSubRuleRequired(true);
        }
    }, [isOpen, editingSubRule, activeProfile]);

    if (!isOpen || !activeProfile) return null;

    const handleSubRuleVarSelect = (val: string) => {
        setSubRuleVarOption(val);
        if (val && val !== '__CUSTOM__') {
            const v = eggVariables.find((ev) => ev.env_variable === val);
            setSubRuleEnvVar(val);
            if (v) {
                setSubRuleName(v.name);
            }
        } else if (val === '__CUSTOM__') {
            setSubRuleEnvVar('');
        }
    };

    const isSubRuleReserved = RESERVED_VARIABLES.includes(subRuleEnvVar.trim().toUpperCase());
    const isSubRuleServerPort = subRuleEnvVar.trim().toUpperCase() === 'SERVER_PORT';

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        const trimmedVar = subRuleEnvVar.trim().toUpperCase();
        if (!subRuleName.trim() || !trimmedVar) {
            toast.error('Please enter a service name and environment variable.');
            return;
        }

        if (isSubRuleServerPort) {
            toast.error('SERVER_PORT is the default primary port. Define secondary sub-rules for extra ports (e.g. HTTP_PORT, ASE_PORT, RCON_PORT).');
            return;
        }

        if (isSubRuleReserved) {
            toast.error(`The variable ${trimmedVar} is reserved by Pterodactyl.`);
            return;
        }

        const validRanges = extractValidRanges(subRuleRanges);

        try {
            setSubmitting(true);
            const payload = {
                name: subRuleName.trim(),
                env_variable: trimmedVar,
                allocation_type: subRuleAllocType,
                offset_value: subRuleAllocType === 'offset' ? Number(subRuleOffset) : null,
                port_ranges: subRuleAllocType === 'range' && validRanges.length > 0 ? validRanges : null,
                auto_create_allocation: subRuleAutoCreate,
                is_required: subRuleRequired,
            };

            if (editingSubRule) {
                const res = await http.put(
                    `/api/admin/extensions/auto-port-allocator/sub-rules/${editingSubRule.id}`,
                    payload
                );
                toast.success(`Side port "${res.data.sub_rule.name}" updated!`);
                onSuccess(res.data.sub_rule, activeProfile.id, true);
            } else {
                const res = await http.post(
                    `/api/admin/extensions/auto-port-allocator/profiles/${activeProfile.id}/sub-rules`,
                    payload
                );
                toast.success(`Side port "${res.data.sub_rule.name}" added to ${activeProfile.name}!`);
                onSuccess(res.data.sub_rule, activeProfile.id, false);
            }
            onClose();
        } catch (err) {
            toast.error(httpErrorToHuman(err));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className={'apa:fixed apa:inset-0 apa:z-50 apa:flex apa:items-center apa:justify-center apa:p-4 apa:bg-black/75 apa:backdrop-blur-sm'}>
            <div className={'apa:bg-card apa:border apa:border-muted apa:rounded-xl apa:shadow-2xl apa:max-w-2xl apa:w-full apa:overflow-hidden apa:animate-in apa:fade-in apa:zoom-in-95'}>
                {/* Modal Header */}
                <div className={'apa:p-4 apa:border-b apa:border-muted apa:flex apa:justify-between apa:items-center apa:bg-muted/20'}>
                    <div>
                        <h3 className={'apa:text-base apa:font-bold apa:text-foreground'}>
                            {editingSubRule
                                ? `Edit Side Port: "${editingSubRule.name}"`
                                : `Add Side Port to "${activeProfile.name}"`}
                        </h3>
                        <p className={'apa:text-xs apa:text-muted-foreground'}>
                            Game Profile: <strong>{activeProfile.name}</strong> ({activeLinkedEggs.map((e) => e.name).join(', ') || `Egg #${activeProfile.egg_id}`})
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className={'apa:text-muted-foreground apa:hover:text-foreground apa:text-lg apa:font-bold apa:p-1 apa:cursor-pointer'}
                    >
                        ✕
                    </button>
                </div>

                {/* Modal Body */}
                <form onSubmit={handleSubmit} className={'apa:p-6 apa:space-y-4'}>
                    <div className={'apa:grid apa:grid-cols-1 md:apa:grid-cols-2 apa:gap-4'}>
                        {/* Target Egg Variable */}
                        <div>
                            <label className={'apa:block apa:text-xs apa:font-medium apa:text-muted-foreground apa:mb-1'}>
                                Target Environment Variable
                            </label>
                            {eggVariables.length > 0 ? (
                                <div className={'apa:space-y-2'}>
                                    <select
                                        value={subRuleVarOption}
                                        onChange={(e) => handleSubRuleVarSelect(e.target.value)}
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
                                    {subRuleVarOption === '__CUSTOM__' && (
                                        <input
                                            type={'text'}
                                            value={subRuleEnvVar}
                                            onChange={(e) => setSubRuleEnvVar(e.target.value.toUpperCase())}
                                            placeholder={'e.g. HTTP_PORT, ASE_PORT'}
                                            className={'apa:w-full apa:rounded apa:border apa:border-muted apa:bg-background apa:p-2 apa:text-sm apa:font-mono'}
                                            required
                                        />
                                    )}
                                </div>
                            ) : (
                                <input
                                    type={'text'}
                                    value={subRuleEnvVar}
                                    onChange={(e) => setSubRuleEnvVar(e.target.value.toUpperCase())}
                                    placeholder={'e.g. HTTP_PORT, ASE_PORT, RCON_PORT'}
                                    className={'apa:w-full apa:rounded apa:border apa:border-muted apa:bg-background apa:p-2 apa:text-sm apa:font-mono'}
                                    required
                                />
                            )}
                        </div>

                        {/* Service Name */}
                        <div>
                            <label className={'apa:block apa:text-xs apa:font-medium apa:text-muted-foreground apa:mb-1'}>
                                Service / Port Name
                            </label>
                            <input
                                type={'text'}
                                value={subRuleName}
                                onChange={(e) => setSubRuleName(e.target.value)}
                                placeholder={'e.g. MTA Web HTTP, ASE Query'}
                                className={'apa:w-full apa:rounded apa:border apa:border-muted apa:bg-background apa:p-2 apa:text-sm'}
                                required
                            />
                        </div>
                    </div>

                    {/* Strategy */}
                    <div>
                        <label className={'apa:block apa:text-xs apa:font-medium apa:text-muted-foreground apa:mb-1'}>
                            Allocation Mode
                        </label>
                        <select
                            value={subRuleAllocType}
                            onChange={(e) => setSubRuleAllocType(e.target.value as any)}
                            className={'apa:w-full apa:rounded apa:border apa:border-muted apa:bg-background apa:p-2 apa:text-sm'}
                        >
                            <option value={'offset'}>Fixed Offset from SERVER_PORT</option>
                            <option value={'range'}>Specific Port Range(s)</option>
                            <option value={'any_available'}>Any Free Port on Node/IP</option>
                        </select>
                    </div>

                    {/* Mode: Offset */}
                    {subRuleAllocType === 'offset' && (
                        <div className={'apa:rounded-lg apa:border apa:border-muted apa:p-3 apa:bg-muted/10'}>
                            <label className={'apa:block apa:text-xs apa:font-medium apa:text-muted-foreground apa:mb-1'}>
                                Offset Value from SERVER_PORT
                            </label>
                            <input
                                type={'number'}
                                value={subRuleOffset}
                                onChange={(e) => setSubRuleOffset(Number(e.target.value))}
                                placeholder={'e.g. 2 for MTA HTTP, 123 for ASE'}
                                className={'apa:w-48 apa:rounded apa:border apa:border-muted apa:bg-background apa:p-2 apa:text-sm'}
                                required
                            />
                            <p className={'apa:text-xs apa:text-muted-foreground apa:mt-1'}>
                                Port formula: <code className={'apa:font-mono'}>SERVER_PORT + {subRuleOffset}</code> (e.g. 22003 + {subRuleOffset} = {22003 + (Number(subRuleOffset) || 0)})
                            </p>
                        </div>
                    )}

                    {/* Mode: Multiple Port Ranges */}
                    {subRuleAllocType === 'range' && (
                        <div className={'apa:rounded-lg apa:border apa:border-muted apa:p-3 apa:bg-muted/10 apa:space-y-3'}>
                            <div className={'apa:flex apa:justify-between apa:items-center apa:gap-3'}>
                                <div>
                                    <label className={'apa:block apa:text-xs apa:font-semibold apa:text-foreground'}>
                                        Dedicated Port Range(s)
                                    </label>
                                    <p className={'apa:text-xs apa:text-muted-foreground'}>
                                        Define one or multiple ranges for this secondary port (e.g. 28016–28025 and 29016–29025).
                                    </p>
                                </div>
                                <Button
                                    size={'xsmall'}
                                    type={'button'}
                                    onClick={addSubRuleRange}
                                    className={'apa:flex apa:items-center apa:gap-1.5 apa:whitespace-nowrap'}
                                >
                                    <Plus className={'apa:w-3.5 apa:h-3.5'} />
                                    <span>Add Another Range</span>
                                </Button>
                            </div>

                            <RangeListInputs
                                ranges={subRuleRanges}
                                onUpdate={updateSubRuleRange}
                                onRemove={removeSubRuleRange}
                                startPlaceholder={'Start (e.g. 28016)'}
                                endPlaceholder={'End (e.g. 28025)'}
                                required
                            />
                        </div>
                    )}

                    {/* Checkbox settings */}
                    <div className={'apa:flex apa:items-center apa:gap-4'}>
                        <label className={'apa:flex apa:items-center apa:gap-2 apa:text-sm'}>
                            <input
                                type={'checkbox'}
                                checked={subRuleAutoCreate}
                                onChange={(e) => setSubRuleAutoCreate(e.target.checked)}
                                className={'apa:rounded'}
                            />
                            <span>Auto-create port on node if missing</span>
                        </label>
                        <label className={'apa:flex apa:items-center apa:gap-2 apa:text-sm'}>
                            <input
                                type={'checkbox'}
                                checked={subRuleRequired}
                                onChange={(e) => setSubRuleRequired(e.target.checked)}
                                className={'apa:rounded'}
                            />
                            <span>Strictly Required</span>
                        </label>
                    </div>

                    {/* Modal Footer */}
                    <div className={'apa:flex apa:justify-end apa:gap-2 apa:pt-2 apa:border-t apa:border-muted'}>
                        <Button onClick={onClose}>
                            Cancel
                        </Button>
                        <Button type={'submit'} isLoading={submitting} disabled={isSubRuleReserved}>
                            {editingSubRule ? 'Update Side Port' : 'Save Side Port'}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}
