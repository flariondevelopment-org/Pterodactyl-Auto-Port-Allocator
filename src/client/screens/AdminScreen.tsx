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
    name: string;
    variables: EggVariable[];
}

interface PortRange {
    start: number | '';
    end: number | '';
}

interface SubRule {
    id: number;
    profile_id: number;
    name: string;
    env_variable: string;
    allocation_type: 'offset' | 'any_available' | 'range';
    offset_value: number | null;
    range_start: number | null;
    range_end: number | null;
    port_ranges?: Array<{ start: number; end: number }> | null;
    auto_create_allocation: boolean;
    is_required: boolean;
}

interface GameProfile {
    id: number;
    egg_id: number;
    name: string;
    description: string | null;
    primary_range_start: number | null;
    primary_range_end: number | null;
    primary_port_ranges?: Array<{ start: number; end: number }> | null;
    egg?: Egg;
    sub_rules?: SubRule[];
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
    const [profiles, setProfiles] = useState<GameProfile[]>([]);
    const [eggs, setEggs] = useState<Egg[]>([]);
    const [loading, setLoading] = useState(true);
    const [submittingProfile, setSubmittingProfile] = useState(false);
    const [submittingSubRule, setSubmittingSubRule] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Profile modal state
    const [showProfileModal, setShowProfileModal] = useState(false);
    const [editingProfile, setEditingProfile] = useState<GameProfile | null>(null);
    const [profileName, setProfileName] = useState('');
    const [profileEggId, setProfileEggId] = useState<number | ''>('');
    const [profileDescription, setProfileDescription] = useState('');
    const [primaryRanges, setPrimaryRanges] = useState<PortRange[]>([{ start: '', end: '' }]);

    // Sub-rule modal state
    const [activeProfileForSubRule, setActiveProfileForSubRule] = useState<GameProfile | null>(null);
    const [editingSubRule, setEditingSubRule] = useState<SubRule | null>(null);
    const [subRuleName, setSubRuleName] = useState('');
    const [subRuleEnvVar, setSubRuleEnvVar] = useState('');
    const [subRuleVarOption, setSubRuleVarOption] = useState('');
    const [subRuleAllocType, setSubRuleAllocType] = useState<'offset' | 'any_available' | 'range'>('offset');
    const [subRuleOffset, setSubRuleOffset] = useState<number>(2);
    const [subRuleRanges, setSubRuleRanges] = useState<PortRange[]>([{ start: 28000, end: 28100 }]);
    const [subRuleAutoCreate, setSubRuleAutoCreate] = useState(true);
    const [subRuleRequired, setSubRuleRequired] = useState(true);

    const loadData = async () => {
        try {
            setError(null);
            const [profilesRes, eggsRes] = await Promise.all([
                http.get('/api/admin/extensions/auto-port-allocator/profiles'),
                http.get('/api/admin/extensions/auto-port-allocator/eggs'),
            ]);
            setProfiles(profilesRes.data.profiles || []);
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

    // Active profile egg variables
    const activeEgg = eggs.find((e) => e.id === activeProfileForSubRule?.egg_id);
    const eggVariables = activeEgg?.variables || [];

    // Primary ranges management
    const addPrimaryRange = () => {
        setPrimaryRanges((prev) => [...prev, { start: '', end: '' }]);
    };

    const updatePrimaryRange = (index: number, field: 'start' | 'end', val: string) => {
        const numVal = val === '' ? '' : Number(val);
        setPrimaryRanges((prev) =>
            prev.map((r, i) => (i === index ? { ...r, [field]: numVal } : r))
        );
    };

    const removePrimaryRange = (index: number) => {
        setPrimaryRanges((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : [{ start: '', end: '' }]));
    };

    // Sub-rule ranges management
    const addSubRuleRange = () => {
        setSubRuleRanges((prev) => [...prev, { start: '', end: '' }]);
    };

    const updateSubRuleRange = (index: number, field: 'start' | 'end', val: string) => {
        const numVal = val === '' ? '' : Number(val);
        setSubRuleRanges((prev) =>
            prev.map((r, i) => (i === index ? { ...r, [field]: numVal } : r))
        );
    };

    const removeSubRuleRange = (index: number) => {
        setSubRuleRanges((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : [{ start: '', end: '' }]));
    };

    const openCreateProfileModal = () => {
        setEditingProfile(null);
        setProfileName('');
        setProfileEggId('');
        setProfileDescription('');
        setPrimaryRanges([{ start: '', end: '' }]);
        setShowProfileModal(true);
    };

    const openEditProfileModal = (profile: GameProfile) => {
        setEditingProfile(profile);
        setProfileName(profile.name);
        setProfileEggId(profile.egg_id);
        setProfileDescription(profile.description || '');
        if (profile.primary_port_ranges && profile.primary_port_ranges.length > 0) {
            setPrimaryRanges(profile.primary_port_ranges.map((r) => ({ start: r.start, end: r.end })));
        } else if (profile.primary_range_start && profile.primary_range_end) {
            setPrimaryRanges([{ start: profile.primary_range_start, end: profile.primary_range_end }]);
        } else {
            setPrimaryRanges([{ start: '', end: '' }]);
        }
        setShowProfileModal(true);
    };

    const handleSaveProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!profileName.trim() || !profileEggId) {
            toast.error('Please enter a game name and select an Egg.');
            return;
        }

        const validRanges = primaryRanges
            .filter((r) => r.start !== '' && r.end !== '' && Number(r.start) > 0 && Number(r.end) >= Number(r.start))
            .map((r) => ({ start: Number(r.start), end: Number(r.end) }));

        try {
            setSubmittingProfile(true);
            const payload = {
                name: profileName.trim(),
                egg_id: Number(profileEggId),
                description: profileDescription.trim() || null,
                primary_port_ranges: validRanges.length > 0 ? validRanges : null,
            };

            if (editingProfile) {
                const res = await http.put(`/api/admin/extensions/auto-port-allocator/profiles/${editingProfile.id}`, payload);
                setProfiles((prev) =>
                    prev.map((p) => (p.id === editingProfile.id ? res.data.profile : p))
                );
                toast.success(`Game profile "${res.data.profile.name}" updated!`);
            } else {
                const res = await http.post('/api/admin/extensions/auto-port-allocator/profiles', payload);
                setProfiles((prev) => [...prev, res.data.profile]);
                toast.success(`Game profile "${res.data.profile.name}" created!`);
            }

            setShowProfileModal(false);
            setEditingProfile(null);
        } catch (err) {
            toast.error(httpErrorToHuman(err));
        } finally {
            setSubmittingProfile(false);
        }
    };

    const handleDeleteProfile = async (profileId: number) => {
        if (!window.confirm('Are you sure you want to delete this game profile and all its configured port rules?')) {
            return;
        }

        try {
            await http.delete(`/api/admin/extensions/auto-port-allocator/profiles/${profileId}`);
            setProfiles((prev) => prev.filter((p) => p.id !== profileId));
            toast.success('Game profile deleted.');
        } catch (err) {
            toast.error(httpErrorToHuman(err));
        }
    };

    const openSubRuleModal = (profile: GameProfile) => {
        setActiveProfileForSubRule(profile);
        setEditingSubRule(null);
        setSubRuleName('');
        setSubRuleEnvVar('');
        setSubRuleVarOption('');
        setSubRuleAllocType('offset');
        setSubRuleOffset(2);
        setSubRuleRanges([{ start: 28000, end: 28100 }]);
        setSubRuleAutoCreate(true);
        setSubRuleRequired(true);
    };

    const openEditSubRuleModal = (profile: GameProfile, subRule: SubRule) => {
        setActiveProfileForSubRule(profile);
        setEditingSubRule(subRule);
        setSubRuleName(subRule.name);
        setSubRuleEnvVar(subRule.env_variable);
        setSubRuleVarOption(subRule.env_variable);
        setSubRuleAllocType(subRule.allocation_type);
        setSubRuleOffset(subRule.offset_value ?? 2);
        if (subRule.port_ranges && subRule.port_ranges.length > 0) {
            setSubRuleRanges(subRule.port_ranges.map((r) => ({ start: r.start, end: r.end })));
        } else if (subRule.range_start && subRule.range_end) {
            setSubRuleRanges([{ start: subRule.range_start, end: subRule.range_end }]);
        } else {
            setSubRuleRanges([{ start: 28000, end: 28100 }]);
        }
        setSubRuleAutoCreate(subRule.auto_create_allocation);
        setSubRuleRequired(subRule.is_required);
    };

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

    const handleSaveSubRule = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!activeProfileForSubRule) return;

        const trimmedVar = subRuleEnvVar.trim().toUpperCase();
        if (!subRuleName.trim() || !trimmedVar) {
            toast.error('Please enter a service name and environment variable.');
            return;
        }

        if (isSubRuleServerPort) {
            toast.error("SERVER_PORT is the default primary port. Define secondary sub-rules for extra ports (e.g. HTTP_PORT, ASE_PORT, RCON_PORT).");
            return;
        }

        if (isSubRuleReserved) {
            toast.error(`The variable ${trimmedVar} is reserved by Pterodactyl.`);
            return;
        }

        const validRanges = subRuleRanges
            .filter((r) => r.start !== '' && r.end !== '' && Number(r.start) > 0 && Number(r.end) >= Number(r.start))
            .map((r) => ({ start: Number(r.start), end: Number(r.end) }));

        try {
            setSubmittingSubRule(true);
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

                setProfiles((prev) =>
                    prev.map((p) => {
                        if (p.id === activeProfileForSubRule.id) {
                            return {
                                ...p,
                                sub_rules: (p.sub_rules || []).map((sr) =>
                                    sr.id === editingSubRule.id ? res.data.sub_rule : sr
                                ),
                            };
                        }
                        return p;
                    })
                );

                toast.success(`Secondary port "${res.data.sub_rule.name}" updated!`);
            } else {
                const res = await http.post(
                    `/api/admin/extensions/auto-port-allocator/profiles/${activeProfileForSubRule.id}/sub-rules`,
                    payload
                );

                setProfiles((prev) =>
                    prev.map((p) => {
                        if (p.id === activeProfileForSubRule.id) {
                            return {
                                ...p,
                                sub_rules: [...(p.sub_rules || []), res.data.sub_rule],
                            };
                        }
                        return p;
                    })
                );

                toast.success(`Secondary port "${res.data.sub_rule.name}" added to ${activeProfileForSubRule.name}!`);
            }

            setActiveProfileForSubRule(null);
            setEditingSubRule(null);
        } catch (err) {
            toast.error(httpErrorToHuman(err));
        } finally {
            setSubmittingSubRule(false);
        }
    };

    const handleDeleteSubRule = async (profileId: number, subRuleId: number) => {
        if (!window.confirm('Delete this secondary port sub-rule?')) return;

        try {
            await http.delete(`/api/admin/extensions/auto-port-allocator/sub-rules/${subRuleId}`);
            setProfiles((prev) =>
                prev.map((p) => {
                    if (p.id === profileId) {
                        return {
                            ...p,
                            sub_rules: (p.sub_rules || []).filter((sr) => sr.id !== subRuleId),
                        };
                    }
                    return p;
                })
            );
            toast.success('Secondary port deleted.');
        } catch (err) {
            toast.error(httpErrorToHuman(err));
        }
    };

    const formatRangesDisplay = (ranges?: Array<{ start: number; end: number }> | null, startFallback?: number | null, endFallback?: number | null) => {
        if (ranges && ranges.length > 0) {
            return ranges.map((r) => `${r.start}–${r.end}`).join(', ');
        }
        if (startFallback && endFallback) {
            return `${startFallback}–${endFallback}`;
        }
        return 'Any Free';
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
        <PageContentBlock title={'Auto Port Allocator — Game Profiles'}>
            <div className={'apa:space-y-8'}>
                {error && <Alert type={'danger'}>{error}</Alert>}

                {/* Concept Banner */}
                <div className={'apa:rounded-lg apa:border apa:border-muted apa:bg-card apa:p-4 apa:text-sm'}>
                    <div className={'apa:flex apa:items-start apa:gap-3'}>
                        <div className={'apa:font-bold apa:text-primary apa:text-base'}>🎮</div>
                        <div className={'apa:space-y-1'}>
                            <p className={'apa:font-semibold apa:text-foreground'}>
                                Game-Centric Multi-Port Architecture
                            </p>
                            <p className={'apa:text-muted-foreground apa:text-xs'}>
                                Create a <strong>Game Profile</strong> (e.g. <em>MTA</em>, <em>Rust</em>, <em>Palworld</em>) linked to an Egg.
                                You can configure one or more <strong>Primary Port Ranges</strong> for the server's default port (<code className={'apa:font-mono'}>SERVER_PORT</code>)
                                and add multiple <strong>Secondary Ports</strong> in pop-up windows using custom modes (Fixed Offset, Multiple Ranges, Any Free).
                            </p>
                        </div>
                    </div>
                </div>

                {/* Header Action: Add Game Profile */}
                <div className={'apa:flex apa:justify-between apa:items-center'}>
                    <div>
                        <h2 className={'apa:text-lg apa:font-bold apa:text-foreground'}>Configured Game Profiles</h2>
                        <p className={'apa:text-xs apa:text-muted-foreground'}>
                            {profiles.length} game profile(s) defined.
                        </p>
                    </div>
                    <Button onClick={openCreateProfileModal}>
                        + Create Game Profile
                    </Button>
                </div>

                {/* Game Profiles Cards List */}
                {profiles.length === 0 ? (
                    <TitledGreyBox title={'No Game Profiles'}>
                        <div className={'apa:p-6 apa:text-center apa:space-y-3'}>
                            <p className={'apa:text-muted-foreground apa:text-sm'}>
                                No game profiles configured yet. Click <strong>+ Create Game Profile</strong> above to get started (e.g. for MTA or Rust).
                            </p>
                        </div>
                    </TitledGreyBox>
                ) : (
                    <div className={'apa:space-y-6'}>
                        {profiles.map((profile) => {
                            const primaryDisplay = formatRangesDisplay(
                                profile.primary_port_ranges,
                                profile.primary_range_start,
                                profile.primary_range_end
                            );

                            return (
                                <div key={profile.id} className={'apa:rounded-lg apa:border apa:border-muted apa:bg-card apa:shadow-sm apa:p-5 apa:space-y-4'}>
                                    {/* Profile Header */}
                                    <div className={'apa:flex apa:flex-wrap apa:justify-between personal-header apa:items-start apa:gap-4 apa:pb-3 apa:border-b apa:border-muted'}>
                                        <div>
                                            <div className={'apa:flex apa:items-center apa:gap-3 apa:flex-wrap'}>
                                                <h3 className={'apa:text-lg apa:font-bold apa:text-foreground'}>{profile.name}</h3>
                                                <Badge tone={'accent'} variant={'solid'}>
                                                    Egg: {profile.egg?.name || `Egg #${profile.egg_id}`}
                                                </Badge>
                                                {primaryDisplay !== 'Any Free' ? (
                                                    <Badge tone={'neutral'} variant={'soft'}>
                                                        Primary Ranges: {primaryDisplay}
                                                    </Badge>
                                                ) : (
                                                    <Badge tone={'neutral'} variant={'soft'}>
                                                        Primary Port: Any Allowed
                                                    </Badge>
                                                )}
                                            </div>
                                            {profile.description && (
                                                <p className={'apa:text-xs apa:text-muted-foreground apa:mt-1'}>{profile.description}</p>
                                            )}
                                        </div>
                                        <div className={'apa:flex apa:items-center apa:gap-2'}>
                                            <Button size={'small'} onClick={() => openSubRuleModal(profile)}>
                                                + Add Secondary Port
                                            </Button>
                                            <button
                                                onClick={() => openEditProfileModal(profile)}
                                                className={'apa:text-primary apa:text-xs apa:font-semibold apa:p-2 apa:hover:underline apa:cursor-pointer'}
                                            >
                                                Edit Game
                                            </button>
                                            <span className={'apa:text-muted'}>|</span>
                                            <button
                                                onClick={() => handleDeleteProfile(profile.id)}
                                                className={'apa:text-destructive apa:text-xs apa:font-semibold apa:p-2 apa:hover:underline apa:cursor-pointer'}
                                            >
                                                Delete Game
                                            </button>
                                        </div>
                                    </div>

                                    {/* Side Ports Table Inside The Box */}
                                    <div className={'apa:rounded-lg apa:border-2 apa:border-slate-700 apa:bg-slate-900/60 apa:overflow-hidden apa:shadow-md'}>
                                        <div className={'apa:px-4 apa:py-3 apa:bg-slate-800/90 apa:border-b-2 personal-table-header apa:border-slate-700 apa:flex apa:justify-between apa:items-center'}>
                                            <div className={'apa:flex apa:items-center apa:gap-2'}>
                                                <span className={'apa:text-xs apa:font-bold apa:uppercase apa:tracking-wider apa:text-slate-200'}>
                                                    Game Ports & Side Ports Configuration
                                                </span>
                                                <Badge tone={'neutral'} variant={'soft'}>
                                                    {(profile.sub_rules?.length || 0) + 1} Port Rules
                                                </Badge>
                                            </div>
                                            <Button size={'xsmall'} onClick={() => openSubRuleModal(profile)}>
                                                + Add Side Port
                                            </Button>
                                        </div>

                                        <div className={'apa:overflow-x-auto'}>
                                            <table className={'apa:w-full apa:text-left apa:border-collapse'}>
                                                <thead>
                                                    <tr className={'apa:border-b-2 apa:border-slate-700 apa:bg-slate-800/70 apa:text-xs apa:text-slate-300 apa:uppercase apa:tracking-wider'}>
                                                        <th className={'apa:py-3.5 apa:px-4 apa:font-semibold apa:border-r apa:border-slate-700/80 last:apa:border-r-0 apa:whitespace-nowrap'}>Service / Role</th>
                                                        <th className={'apa:py-3.5 apa:px-4 apa:font-semibold apa:border-r apa:border-slate-700/80 last:apa:border-r-0 apa:whitespace-nowrap'}>Environment Key</th>
                                                        <th className={'apa:py-3.5 apa:px-4 personal-type apa:font-semibold apa:border-r apa:border-slate-700/80 last:apa:border-r-0 apa:whitespace-nowrap'}>Port Type</th>
                                                        <th className={'apa:py-3.5 apa:px-4 apa:font-semibold apa:border-r apa:border-slate-700/80 last:apa:border-r-0 apa:whitespace-nowrap'}>Port Formula / Range(s)</th>
                                                        <th className={'apa:py-3.5 apa:px-4 apa:font-semibold apa:border-r apa:border-slate-700/80 last:apa:border-r-0 apa:whitespace-nowrap'}>Auto-Create</th>
                                                        <th className={'apa:py-3.5 apa:px-4 apa:font-semibold apa:border-r apa:border-slate-700/80 last:apa:border-r-0 apa:whitespace-nowrap'}>Required</th>
                                                        <th className={'apa:py-3.5 apa:px-4 apa:font-semibold apa:whitespace-nowrap'}>Actions</th>
                                                    </tr>
                                                </thead>
                                                <tbody className={'apa:text-sm'}>
                                                    {/* Primary Game Port (Base Allocation) */}
                                                    <tr className={'apa:border-b apa:border-slate-700/60 apa:bg-slate-800/20 apa:hover:bg-slate-800/40 apa:transition-colors'}>
                                                        <td className={'apa:py-3.5 apa:px-4 apa:font-medium apa:border-r apa:border-slate-700/50'}>
                                                            <div className={'apa:flex apa:items-center apa:gap-2 apa:whitespace-nowrap'}>
                                                                <span className={'apa:text-slate-100 apa:font-semibold'}>Primary Game Port</span>
                                                                <Badge tone={'accent'} variant={'solid'}>Primary</Badge>
                                                            </div>
                                                        </td>
                                                        <td className={'apa:py-3.5 apa:px-4 apa:border-r apa:border-slate-700/50 apa:whitespace-nowrap'}>
                                                            <span className={'apa:font-mono apa:text-xs apa:font-bold apa:text-primary'}>
                                                                SERVER_PORT
                                                            </span>
                                                        </td>
                                                        <td className={'apa:py-3.5 personal-type apa:px-4 apa:border-r apa:border-slate-700/50 apa:whitespace-nowrap'}>
                                                            <Badge tone={'neutral'} variant={'soft'}>Primary Range</Badge>
                                                        </td>
                                                        <td className={'apa:py-3.5 apa:px-4 apa:font-mono apa:text-xs apa:text-slate-200 apa:border-r apa:border-slate-700/50'}>
                                                            {primaryDisplay}
                                                        </td>
                                                        <td className={'apa:py-3.5 apa:px-4 apa:text-xs apa:text-slate-400 apa:border-r apa:border-slate-700/50'}>
                                                            —
                                                        </td>
                                                        <td className={'apa:py-3.5 apa:px-4 apa:text-xs apa:border-r apa:border-slate-700/50 apa:whitespace-nowrap'}>
                                                            <span className={'apa:text-slate-200 apa:font-medium'}>Always Required</span>
                                                        </td>
                                                        <td className={'apa:py-3.5 apa:px-4 apa:whitespace-nowrap'}>
                                                            <div className={'apa:flex apa:items-center apa:gap-2'}>
                                                                <button
                                                                    onClick={() => openEditProfileModal(profile)}
                                                                    className={'apa:text-primary apa:text-xs apa:font-semibold apa:hover:underline apa:cursor-pointer'}
                                                                >
                                                                    Edit
                                                                </button>
                                                                <span className={'apa:text-slate-500 apa:text-xs'}>| Base Port</span>
                                                            </div>
                                                        </td>
                                                    </tr>

                                                    {/* Secondary Side Ports */}
                                                    {profile.sub_rules && profile.sub_rules.length > 0 ? (
                                                        profile.sub_rules.map((subRule) => (
                                                            <tr key={subRule.id} className={'apa:border-b apa:border-slate-700/60 last:apa:border-b-0 apa:hover:bg-slate-800/40 apa:transition-colors'}>
                                                                <td className={'apa:py-3.5 apa:px-4 apa:font-medium apa:border-r apa:border-slate-700/50'}>
                                                                    <div className={'apa:flex personal-badge apa:items-center apa:gap-2 apa:whitespace-nowrap'}>
                                                                        <span className={'apa:text-slate-200'}>{subRule.name}</span>
                                                                        <Badge tone={'neutral'} variant={'soft'}>Side Port</Badge>
                                                                    </div>
                                                                </td>
                                                                <td className={'apa:py-3.5 apa:px-4 apa:border-r apa:border-slate-700/50 apa:whitespace-nowrap'}>
                                                                    <span className={'apa:font-mono apa:text-xs apa:font-bold apa:text-primary'}>
                                                                        {subRule.env_variable}
                                                                    </span>
                                                                </td>
                                                                <td className={'apa:py-3.5 personal-type apa:px-4 apa:border-r apa:border-slate-700/50 apa:whitespace-nowrap'}>
                                                                    <Badge tone={'accent'} variant={'soft'}>
                                                                        {subRule.allocation_type === 'offset'
                                                                            ? 'Fixed Offset'
                                                                            : subRule.allocation_type === 'range'
                                                                              ? 'Port Range(s)'
                                                                              : 'Any Available'}
                                                                    </Badge>
                                                                </td>
                                                                <td className={'apa:py-3.5 apa:px-4 apa:font-mono apa:text-xs apa:text-slate-200 apa:border-r apa:border-slate-700/50'}>
                                                                    {subRule.allocation_type === 'offset' && (
                                                                        <span className={'apa:font-semibold'}>SERVER_PORT + {subRule.offset_value}</span>
                                                                    )}
                                                                    {subRule.allocation_type === 'range' && (
                                                                        <span>
                                                                            {formatRangesDisplay(
                                                                                subRule.port_ranges,
                                                                                subRule.range_start,
                                                                                subRule.range_end
                                                                            )}
                                                                        </span>
                                                                    )}
                                                                    {subRule.allocation_type === 'any_available' && (
                                                                        <span className={'apa:text-slate-400'}>Any Free Port</span>
                                                                    )}
                                                                </td>
                                                                <td className={'apa:py-3.5 apa:px-4 apa:text-xs apa:border-r apa:border-slate-700/50'}>
                                                                    {subRule.auto_create_allocation ? (
                                                                        <span className={'apa:text-emerald-400 apa:font-semibold'}>Yes</span>
                                                                    ) : (
                                                                        <span className={'apa:text-slate-400'}>No</span>
                                                                    )}
                                                                </td>
                                                                <td className={'apa:py-3.5 apa:px-4 apa:text-xs apa:border-r apa:border-slate-700/50 apa:whitespace-nowrap'}>
                                                                    {subRule.is_required ? (
                                                                        <span className={'apa:text-slate-200 apa:font-medium'}>Required</span>
                                                                    ) : (
                                                                        <span className={'apa:text-slate-400'}>Optional</span>
                                                                    )}
                                                                </td>
                                                                <td className={'apa:py-3.5 apa:px-4 apa:whitespace-nowrap'}>
                                                                    <div className={'apa:flex apa:items-center apa:gap-2'}>
                                                                        <button
                                                                            onClick={() => openEditSubRuleModal(profile, subRule)}
                                                                            className={'apa:text-primary apa:text-xs personal-action apa:font-semibold apa:hover:underline apa:cursor-pointer'}
                                                                        >
                                                                            Edit
                                                                        </button>
                                                                        <span className={'apa:text-slate-600'}>|</span>
                                                                        <button
                                                                            onClick={() => handleDeleteSubRule(profile.id, subRule.id)}
                                                                            className={'apa:text-destructive apa:text-xs personal-action apa:font-semibold apa:hover:underline apa:cursor-pointer'}
                                                                        >
                                                                            Delete
                                                                        </button>
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        ))
                                                    ) : (
                                                        <tr>
                                                            <td colSpan={7} className={'apa:py-6 apa:px-4 apa:text-center apa:text-xs apa:text-slate-400'}>
                                                                No side ports configured yet for {profile.name}.{' '}
                                                                <button
                                                                    onClick={() => openSubRuleModal(profile)}
                                                                    className={'apa:text-primary apa:font-semibold apa:hover:underline apa:ml-1 apa:cursor-pointer'}
                                                                >
                                                                    + Add Side Port
                                                                </button>{' '}
                                                                (e.g. HTTP_PORT, ASE_PORT, RCON_PORT, Query).
                                                            </td>
                                                        </tr>
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* ======================================================== */}
                {/* POP-UP MODAL: CREATE OR EDIT GAME PROFILE                */}
                {/* ======================================================== */}
                {showProfileModal && (
                    <div className={'apa:fixed apa:inset-0 apa:z-50 apa:flex apa:items-center apa:justify-center apa:p-4 apa:bg-black/75 apa:backdrop-blur-sm'}>
                        <div className={'apa:bg-card apa:border apa:border-muted apa:rounded-xl apa:shadow-2xl apa:max-w-2xl apa:w-full apa:overflow-hidden apa:animate-in apa:fade-in apa:zoom-in-95'}>
                            {/* Modal Header */}
                            <div className={'apa:p-4 apa:border-b apa:border-muted apa:flex apa:justify-between apa:items-center apa:bg-muted/20'}>
                                <div>
                                    <h3 className={'apa:text-base apa:font-bold apa:text-foreground'}>
                                        {editingProfile ? `Edit Game Profile: "${editingProfile.name}"` : 'Create New Game Profile'}
                                    </h3>
                                    <p className={'apa:text-xs apa:text-muted-foreground'}>
                                        Configure a game template with primary port range restrictions.
                                    </p>
                                </div>
                                <button
                                    onClick={() => {
                                        setShowProfileModal(false);
                                        setEditingProfile(null);
                                    }}
                                    className={'apa:text-muted-foreground apa:hover:text-foreground apa:text-lg apa:font-bold apa:p-1 apa:cursor-pointer'}
                                >
                                    ✕
                                </button>
                            </div>

                            {/* Modal Body */}
                            <form onSubmit={handleSaveProfile} className={'apa:p-6 apa:space-y-4'}>
                                <div className={'apa:grid apa:grid-cols-1 md:apa:grid-cols-2 apa:gap-4'}>
                                    {/* Game Profile Name */}
                                    <div>
                                        <label className={'apa:block apa:text-xs apa:font-medium apa:text-muted-foreground apa:mb-1'}>
                                            Game Profile Name
                                        </label>
                                        <input
                                            type={'text'}
                                            value={profileName}
                                            onChange={(e) => setProfileName(e.target.value)}
                                            placeholder={'e.g. MTA (Multi Theft Auto), Rust'}
                                            className={'apa:w-full apa:rounded apa:border apa:border-muted apa:bg-background apa:p-2 apa:text-sm'}
                                            required
                                        />
                                    </div>

                                    {/* Target Egg */}
                                    <div>
                                        <label className={'apa:block apa:text-xs apa:font-medium apa:text-muted-foreground apa:mb-1'}>
                                            Target Egg
                                        </label>
                                        <select
                                            value={profileEggId}
                                            onChange={(e) => setProfileEggId(e.target.value ? Number(e.target.value) : '')}
                                            className={'apa:w-full apa:rounded apa:border apa:border-muted apa:bg-background apa:p-2 apa:text-sm'}
                                            required
                                        >
                                            <option value={''}>Select Target Egg...</option>
                                            {eggs.map((egg) => (
                                                <option key={egg.id} value={egg.id}>
                                                    {egg.name} (Egg #{egg.id})
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                {/* Description */}
                                <div>
                                    <label className={'apa:block apa:text-xs apa:font-medium apa:text-muted-foreground apa:mb-1'}>
                                        Description (Optional)
                                    </label>
                                    <input
                                        type={'text'}
                                        value={profileDescription}
                                        onChange={(e) => setProfileDescription(e.target.value)}
                                        placeholder={'e.g. Multi-port setup with HTTP and ASE ports'}
                                        className={'apa:w-full apa:rounded apa:border apa:border-muted apa:bg-background apa:p-2 apa:text-sm'}
                                    />
                                </div>

                                {/* Multiple Primary Port Ranges */}
                                <div className={'apa:rounded-lg apa:border apa:border-muted apa:p-3 apa:bg-muted/10 apa:space-y-3'}>
                                    <div className={'apa:flex apa:justify-between apa:items-center'}>
                                        <div>
                                            <label className={'apa:block apa:text-xs apa:font-semibold apa:text-foreground'}>
                                                Primary Port (SERVER_PORT) Allowed Range(s)
                                            </label>
                                            <p className={'apa:text-xs apa:text-muted-foreground'}>
                                                You can define one or more port ranges (e.g. 22003–22050 and 22100–22150). Leave blank for any port.
                                            </p>
                                        </div>
                                        <button
                                            type={'button'}
                                            onClick={addPrimaryRange}
                                            className={'apa:text-xs apa:font-medium apa:text-primary apa:hover:underline apa:cursor-pointer'}
                                        >
                                            + Add Another Range
                                        </button>
                                    </div>

                                    <div className={'apa:space-y-2'}>
                                        {primaryRanges.map((range, idx) => (
                                            <div key={idx} className={'apa:flex personal-range apa:items-center apa:gap-2'}>
                                                <input
                                                    type={'number'}
                                                    value={range.start}
                                                    onChange={(e) => updatePrimaryRange(idx, 'start', e.target.value)}
                                                    placeholder={'Start (e.g. 22003)'}
                                                    className={'apa:w-1/2 apa:rounded apa:border apa:border-muted apa:bg-background apa:p-2 apa:text-sm'}
                                                />
                                                <span className={'apa:text-muted-foreground apa:text-xs'}>to</span>
                                                <input
                                                    type={'number'}
                                                    value={range.end}
                                                    onChange={(e) => updatePrimaryRange(idx, 'end', e.target.value)}
                                                    placeholder={'End (e.g. 22050)'}
                                                    className={'apa:w-1/2 apa:rounded apa:border apa:border-muted apa:bg-background apa:p-2 apa:text-sm'}
                                                />
                                                {primaryRanges.length > 1 && (
                                                    <button
                                                        type={'button'}
                                                        onClick={() => removePrimaryRange(idx)}
                                                        className={'apa:text-destructive apa:text-sm apa:p-1 apa:hover:opacity-80 apa:cursor-pointer'}
                                                        title={'Remove Range'}
                                                    >
                                                        ✕
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Modal Footer */}
                                <div className={'apa:flex apa:justify-end apa:gap-2 apa:pt-2 apa:border-t apa:border-muted'}>
                                    <Button
                                        onClick={() => {
                                            setShowProfileModal(false);
                                            setEditingProfile(null);
                                        }}
                                    >
                                        Cancel
                                    </Button>
                                    <Button type={'submit'} isLoading={submittingProfile}>
                                        {editingProfile ? 'Update Game Profile' : 'Create Game Profile'}
                                    </Button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* ======================================================== */}
                {/* POP-UP MODAL: ADD OR EDIT SECONDARY PORT (SUB-RULE)      */}
                {/* ======================================================== */}
                {activeProfileForSubRule && (
                    <div className={'apa:fixed apa:inset-0 apa:z-50 apa:flex apa:items-center apa:justify-center apa:p-4 apa:bg-black/75 apa:backdrop-blur-sm'}>
                        <div className={'apa:bg-card apa:border apa:border-muted apa:rounded-xl apa:shadow-2xl apa:max-w-2xl apa:w-full apa:overflow-hidden personal-subrule-modal apa:animate-in apa:fade-in apa:zoom-in-95'}>
                            {/* Modal Header */}
                            <div className={'apa:p-4 apa:border-b apa:border-muted apa:flex apa:justify-between apa:items-center apa:bg-muted/20'}>
                                <div>
                                    <h3 className={'apa:text-base apa:font-bold apa:text-foreground'}>
                                        {editingSubRule
                                            ? `Edit Secondary Port: "${editingSubRule.name}"`
                                            : `Add Secondary Port to "${activeProfileForSubRule.name}"`}
                                    </h3>
                                    <p className={'apa:text-xs apa:text-muted-foreground'}>
                                        Game Profile: {activeProfileForSubRule.name} (Egg #{activeProfileForSubRule.egg_id})
                                    </p>
                                </div>
                                <button
                                    onClick={() => {
                                        setActiveProfileForSubRule(null);
                                        setEditingSubRule(null);
                                    }}
                                    className={'apa:text-muted-foreground apa:hover:text-foreground apa:text-lg apa:font-bold apa:p-1 apa:cursor-pointer'}
                                >
                                    ✕
                                </button>
                            </div>

                            {/* Modal Body */}
                            <form onSubmit={handleSaveSubRule} className={'apa:p-6 apa:space-y-4'}>
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
                                                    className={'apa:w-full apa:rounded apa:border apa:border-muted apa:bg-background personal-input apa:p-2 apa:text-sm apa:font-mono'}
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
                                                        className={'apa:w-full apa:rounded apa:border apa:border-muted apa:bg-background personal-input apa:p-2 apa:text-sm apa:font-mono'}
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
                                                className={'apa:w-full apa:rounded apa:border apa:border-muted apa:bg-background personal-input apa:p-2 apa:text-sm apa:font-mono'}
                                                required
                                            />
                                        )}
                                    </div>

                                    {/* Service Name */}
                                    <div>
                                        <label className={'apa:block apa:text-xs personal-label apa:font-medium apa:text-muted-foreground apa:mb-1'}>
                                            Service / Port Name
                                        </label>
                                        <input
                                            type={'text'}
                                            value={subRuleName}
                                            onChange={(e) => setSubRuleName(e.target.value)}
                                            placeholder={'e.g. MTA Web HTTP, ASE Query'}
                                            className={'apa:w-full apa:rounded apa:border apa:border-muted personal-input apa:bg-background apa:p-2 apa:text-sm'}
                                            required
                                        />
                                    </div>
                                </div>

                                {/* Strategy */}
                                <div>
                                    <label className={'apa:block apa:text-xs personal-label apa:font-medium apa:text-muted-foreground apa:mb-1'}>
                                        Allocation Mode
                                    </label>
                                    <select
                                        value={subRuleAllocType}
                                        onChange={(e) => setSubRuleAllocType(e.target.value as any)}
                                        className={'apa:w-full apa:rounded apa:border apa:border-muted personal-input apa:bg-background apa:p-2 apa:text-sm'}
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
                                            className={'apa:w-48 apa:rounded apa:border apa:border-muted personal-input apa:bg-background apa:p-2 apa:text-sm'}
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
                                        <div className={'apa:flex apa:justify-between apa:items-center'}>
                                            <div>
                                                <label className={'apa:block apa:text-xs apa:font-semibold apa:text-foreground'}>
                                                    Dedicated Port Range(s)
                                                </label>
                                                <p className={'apa:text-xs apa:text-muted-foreground'}>
                                                    Define one or multiple ranges for this secondary port (e.g. 28016–28025 and 29016–29025).
                                                </p>
                                            </div>
                                            <button
                                                type={'button'}
                                                onClick={addSubRuleRange}
                                                className={'apa:text-xs apa:font-medium apa:text-primary apa:hover:underline apa:cursor-pointer'}
                                            >
                                                + Add Another Range
                                            </button>
                                        </div>

                                        <div className={'apa:space-y-2'}>
                                            {subRuleRanges.map((range, idx) => (
                                                <div key={idx} className={'apa:flex apa:items-center apa:gap-2'}>
                                                    <input
                                                        type={'number'}
                                                        value={range.start}
                                                        onChange={(e) => updateSubRuleRange(idx, 'start', e.target.value)}
                                                        placeholder={'Start (e.g. 28016)'}
                                                        className={'apa:w-1/2 apa:rounded apa:border apa:border-muted personal-input apa:bg-background apa:p-2 apa:text-sm'}
                                                        required
                                                    />
                                                    <span className={'apa:text-muted-foreground apa:text-xs'}>to</span>
                                                    <input
                                                        type={'number'}
                                                        value={range.end}
                                                        onChange={(e) => updateSubRuleRange(idx, 'end', e.target.value)}
                                                        placeholder={'End (e.g. 28025)'}
                                                        className={'apa:w-1/2 apa:rounded apa:border apa:border-muted personal-input apa:bg-background apa:p-2 apa:text-sm'}
                                                        required
                                                    />
                                                    {subRuleRanges.length > 1 && (
                                                        <button
                                                            type={'button'}
                                                            onClick={() => removeSubRuleRange(idx)}
                                                            className={'apa:text-destructive apa:text-sm apa:p-1 apa:hover:opacity-80 apa:cursor-pointer'}
                                                            title={'Remove Range'}
                                                        >
                                                            ✕
                                                        </button>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
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
                                    <label className={'apa:flex apa:items-center personal-checkbox apa:gap-2 apa:text-sm'}>
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
                                    <Button
                                        onClick={() => {
                                            setActiveProfileForSubRule(null);
                                            setEditingSubRule(null);
                                        }}
                                    >
                                        Cancel
                                    </Button>
                                    <Button type={'submit'} isLoading={submittingSubRule} disabled={isSubRuleReserved}>
                                        {editingSubRule ? 'Update Secondary Port' : 'Save Secondary Port'}
                                    </Button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}
            </div>
        </PageContentBlock>
    );
}
