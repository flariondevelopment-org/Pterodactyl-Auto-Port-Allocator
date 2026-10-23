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

interface SubRule {
    id: number;
    profile_id: number;
    name: string;
    env_variable: string;
    allocation_type: 'offset' | 'any_available' | 'range';
    offset_value: number | null;
    range_start: number | null;
    range_end: number | null;
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

    // Profile modal / form state
    const [showProfileForm, setShowProfileForm] = useState(false);
    const [profileName, setProfileName] = useState('');
    const [profileEggId, setProfileEggId] = useState<number | ''>('');
    const [profileDescription, setProfileDescription] = useState('');
    const [primaryRangeStart, setPrimaryRangeStart] = useState<number | ''>('');
    const [primaryRangeEnd, setPrimaryRangeEnd] = useState<number | ''>('');

    // Sub-rule modal / form state
    const [activeProfileForSubRule, setActiveProfileForSubRule] = useState<GameProfile | null>(null);
    const [subRuleName, setSubRuleName] = useState('');
    const [subRuleEnvVar, setSubRuleEnvVar] = useState('');
    const [subRuleVarOption, setSubRuleVarOption] = useState('');
    const [subRuleAllocType, setSubRuleAllocType] = useState<'offset' | 'any_available' | 'range'>('offset');
    const [subRuleOffset, setSubRuleOffset] = useState<number>(2);
    const [subRuleRangeStart, setSubRuleRangeStart] = useState<number>(28000);
    const [subRuleRangeEnd, setSubRuleRangeEnd] = useState<number>(28100);
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

    const handleCreateProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!profileName.trim() || !profileEggId) {
            toast.error('Please enter a game name and select an Egg.');
            return;
        }

        try {
            setSubmittingProfile(true);
            const payload = {
                name: profileName.trim(),
                egg_id: Number(profileEggId),
                description: profileDescription.trim() || null,
                primary_range_start: primaryRangeStart !== '' ? Number(primaryRangeStart) : null,
                primary_range_end: primaryRangeEnd !== '' ? Number(primaryRangeEnd) : null,
            };

            const res = await http.post('/api/admin/extensions/auto-port-allocator/profiles', payload);
            setProfiles((prev) => [...prev, res.data.profile]);
            toast.success(`Game profile "${res.data.profile.name}" created!`);

            // Reset profile form
            setProfileName('');
            setProfileEggId('');
            setProfileDescription('');
            setPrimaryRangeStart('');
            setPrimaryRangeEnd('');
            setShowProfileForm(false);
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
        setSubRuleName('');
        setSubRuleEnvVar('');
        setSubRuleVarOption('');
        setSubRuleAllocType('offset');
        setSubRuleOffset(2);
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

    const handleCreateSubRule = async (e: React.FormEvent) => {
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

        try {
            setSubmittingSubRule(true);
            const payload = {
                name: subRuleName.trim(),
                env_variable: trimmedVar,
                allocation_type: subRuleAllocType,
                offset_value: subRuleAllocType === 'offset' ? Number(subRuleOffset) : null,
                range_start: subRuleAllocType === 'range' ? Number(subRuleRangeStart) : null,
                range_end: subRuleAllocType === 'range' ? Number(subRuleRangeEnd) : null,
                auto_create_allocation: subRuleAutoCreate,
                is_required: subRuleRequired,
            };

            const res = await http.post(
                `/api/admin/extensions/auto-port-allocator/profiles/${activeProfileForSubRule.id}/sub-rules`,
                payload
            );

            // Update local state
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
            setActiveProfileForSubRule(null);
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
                                Inside each game, define the <strong>Primary Port Range</strong> for the server's default port (<code className={'apa:font-mono'}>SERVER_PORT</code>)
                                and configure multiple <strong>Secondary Ports</strong> (e.g. HTTP, ASE, RCON, Query) with custom allocation strategies (Offset, Range, Any Available).
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
                    <Button onClick={() => setShowProfileForm(!showProfileForm)}>
                        {showProfileForm ? 'Cancel' : '+ Create Game Profile'}
                    </Button>
                </div>

                {/* Create Profile Form Box */}
                {showProfileForm && (
                    <TitledGreyBox title={'Define New Game Profile'}>
                        <form onSubmit={handleCreateProfile} className={'apa:space-y-4 apa:p-2'}>
                            <div className={'apa:grid apa:grid-cols-1 md:apa:grid-cols-3 apa:gap-4'}>
                                {/* Game Name */}
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

                                {/* Description */}
                                <div>
                                    <label className={'apa:block apa:text-xs apa:font-medium apa:text-muted-foreground apa:mb-1'}>
                                        Description (Optional)
                                    </label>
                                    <input
                                        type={'text'}
                                        value={profileDescription}
                                        onChange={(e) => setProfileDescription(e.target.value)}
                                        placeholder={'e.g. Standard MTA 3-port configuration'}
                                        className={'apa:w-full apa:rounded apa:border apa:border-muted apa:bg-background apa:p-2 apa:text-sm'}
                                    />
                                </div>
                            </div>

                            {/* Primary Port Range Constraints */}
                            <div className={'apa:rounded apa:border apa:border-muted apa:p-3 apa:bg-muted/10'}>
                                <label className={'apa:block apa:text-xs apa:font-semibold apa:text-foreground apa:mb-1'}>
                                    Primary Game Port (SERVER_PORT) Range Limits (Optional)
                                </label>
                                <p className={'apa:text-xs apa:text-muted-foreground apa:mb-3'}>
                                    Restrict the server's default port to a specific range (e.g. MTA game port is normally 22003–22050).
                                </p>
                                <div className={'apa:grid apa:grid-cols-1 md:apa:grid-cols-2 apa:gap-4'}>
                                    <div>
                                        <label className={'apa:block apa:text-xs apa:font-medium apa:text-muted-foreground apa:mb-1'}>
                                            Primary Range Start
                                        </label>
                                        <input
                                            type={'number'}
                                            value={primaryRangeStart}
                                            onChange={(e) => setPrimaryRangeStart(e.target.value ? Number(e.target.value) : '')}
                                            placeholder={'e.g. 22003'}
                                            className={'apa:w-full apa:rounded apa:border apa:border-muted apa:bg-background apa:p-2 apa:text-sm'}
                                        />
                                    </div>
                                    <div>
                                        <label className={'apa:block apa:text-xs apa:font-medium apa:text-muted-foreground apa:mb-1'}>
                                            Primary Range End
                                        </label>
                                        <input
                                            type={'number'}
                                            value={primaryRangeEnd}
                                            onChange={(e) => setPrimaryRangeEnd(e.target.value ? Number(e.target.value) : '')}
                                            placeholder={'e.g. 22050'}
                                            className={'apa:w-full apa:rounded apa:border apa:border-muted apa:bg-background apa:p-2 apa:text-sm'}
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className={'apa:flex apa:justify-end apa:pt-2'}>
                                <Button type={'submit'} isLoading={submittingProfile}>
                                    Save Game Profile
                                </Button>
                            </div>
                        </form>
                    </TitledGreyBox>
                )}

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
                        {profiles.map((profile) => (
                            <div key={profile.id} className={'apa:rounded-lg apa:border apa:border-muted apa:bg-card apa:shadow-sm'}>
                                {/* Profile Header */}
                                <div className={'apa:p-4 apa:border-b apa:border-muted apa:flex apa:flex-wrap apa:justify-between apa:items-center apa:gap-4'}>
                                    <div>
                                        <div className={'apa:flex apa:items-center apa:gap-3'}>
                                            <h3 className={'apa:text-base apa:font-bold apa:text-foreground'}>{profile.name}</h3>
                                            <Badge tone={'accent'} variant={'solid'}>
                                                Egg: {profile.egg?.name || `Egg #${profile.egg_id}`}
                                            </Badge>
                                            {profile.primary_range_start && profile.primary_range_end ? (
                                                <Badge tone={'neutral'} variant={'soft'}>
                                                    Primary Port Range: {profile.primary_range_start}–{profile.primary_range_end}
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
                                        <Button onClick={() => openSubRuleModal(profile)}>
                                            + Add Secondary Port
                                        </Button>
                                        <button
                                            onClick={() => handleDeleteProfile(profile.id)}
                                            className={'apa:text-destructive apa:text-xs apa:font-medium apa:p-2 apa:hover:underline'}
                                        >
                                            Delete Game
                                        </button>
                                    </div>
                                </div>

                                {/* Secondary Ports List */}
                                <div className={'apa:p-4'}>
                                    {(!profile.sub_rules || profile.sub_rules.length === 0) ? (
                                        <p className={'apa:text-xs apa:text-muted-foreground apa:py-2'}>
                                            No secondary ports added yet. Click <strong>+ Add Secondary Port</strong> to add RCON, HTTP, ASE, Query, etc.
                                        </p>
                                    ) : (
                                        <div className={'apa:overflow-x-auto'}>
                                            <table className={'apa:w-full apa:text-left apa:border-collapse'}>
                                                <thead>
                                                    <tr className={'apa:border-b apa:border-muted apa:text-xs apa:text-muted-foreground apa:uppercase'}>
                                                        <th className={'apa:py-2 apa:px-3'}>Service / Role</th>
                                                        <th className={'apa:py-2 apa:px-3'}>Environment Key</th>
                                                        <th className={'apa:py-2 apa:px-3'}>Strategy</th>
                                                        <th className={'apa:py-2 apa:px-3'}>Port Formula / Range</th>
                                                        <th className={'apa:py-2 apa:px-3'}>Auto-Create</th>
                                                        <th className={'apa:py-2 apa:px-3'}>Required</th>
                                                        <th className={'apa:py-2 apa:px-3'}>Actions</th>
                                                    </tr>
                                                </thead>
                                                <tbody className={'apa:divide-y apa:divide-muted'}>
                                                    {profile.sub_rules.map((subRule) => (
                                                        <tr key={subRule.id} className={'apa:hover:bg-muted/20'}>
                                                            <td className={'apa:py-2 apa:px-3 apa:font-medium apa:text-sm'}>
                                                                {subRule.name}
                                                            </td>
                                                            <td className={'apa:py-2 apa:px-3'}>
                                                                <span className={'apa:font-mono apa:text-xs apa:font-bold apa:text-primary'}>
                                                                    {subRule.env_variable}
                                                                </span>
                                                            </td>
                                                            <td className={'apa:py-2 apa:px-3'}>
                                                                <Badge tone={'neutral'} variant={'soft'}>
                                                                    {subRule.allocation_type === 'offset'
                                                                        ? 'Fixed Offset'
                                                                        : subRule.allocation_type === 'range'
                                                                          ? 'Port Range'
                                                                          : 'Any Available'}
                                                                </Badge>
                                                            </td>
                                                            <td className={'apa:py-2 apa:px-3 apa:font-mono apa:text-xs'}>
                                                                {subRule.allocation_type === 'offset' && (
                                                                    <span>SERVER_PORT + {subRule.offset_value}</span>
                                                                )}
                                                                {subRule.allocation_type === 'range' && (
                                                                    <span>{subRule.range_start}–{subRule.range_end}</span>
                                                                )}
                                                                {subRule.allocation_type === 'any_available' && (
                                                                    <span className={'apa:text-muted-foreground'}>Any Free Port</span>
                                                                )}
                                                            </td>
                                                            <td className={'apa:py-2 apa:px-3 apa:text-xs'}>
                                                                {subRule.auto_create_allocation ? (
                                                                    <span className={'apa:text-success apa:font-medium'}>Yes</span>
                                                                ) : (
                                                                    <span className={'apa:text-muted-foreground'}>No</span>
                                                                )}
                                                            </td>
                                                            <td className={'apa:py-2 apa:px-3 apa:text-xs'}>
                                                                {subRule.is_required ? (
                                                                    <span className={'apa:text-foreground apa:font-medium'}>Required</span>
                                                                ) : (
                                                                    <span className={'apa:text-muted-foreground'}>Optional</span>
                                                                )}
                                                            </td>
                                                            <td className={'apa:py-2 apa:px-3'}>
                                                                <button
                                                                    onClick={() => handleDeleteSubRule(profile.id, subRule.id)}
                                                                    className={'apa:text-destructive apa:text-xs apa:hover:underline'}
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
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Sub-Rule Creation Modal / Form */}
                {activeProfileForSubRule && (
                    <TitledGreyBox title={`Add Secondary Port to "${activeProfileForSubRule.name}"`}>
                        <form onSubmit={handleCreateSubRule} className={'apa:space-y-4 apa:p-2'}>
                            <div className={'apa:grid apa:grid-cols-1 md:apa:grid-cols-3 apa:gap-4'}>
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
                                        Service Name
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
                                        <option value={'any_available'}>Any Free Port on Node/IP</option>
                                        <option value={'range'}>Specific Port Range</option>
                                    </select>
                                </div>
                            </div>

                            {/* Mode Specific Inputs */}
                            {subRuleAllocType === 'offset' && (
                                <div className={'apa:rounded apa:border apa:border-muted apa:p-3 apa:bg-muted/10'}>
                                    <label className={'apa:block apa:text-xs apa:font-medium apa:text-muted-foreground apa:mb-1'}>
                                        Offset from SERVER_PORT (e.g. 2 for MTA HTTP, 123 for ASE)
                                    </label>
                                    <input
                                        type={'number'}
                                        value={subRuleOffset}
                                        onChange={(e) => setSubRuleOffset(Number(e.target.value))}
                                        className={'apa:w-48 apa:rounded apa:border apa:border-muted apa:bg-background apa:p-2 apa:text-sm'}
                                        required
                                    />
                                    <p className={'apa:text-xs apa:text-muted-foreground apa:mt-1'}>
                                        Port formula: <code className={'apa:font-mono'}>SERVER_PORT + {subRuleOffset}</code>
                                    </p>
                                </div>
                            )}

                            {subRuleAllocType === 'range' && (
                                <div className={'apa:flex apa:gap-4 apa:rounded apa:border apa:border-muted apa:p-3 apa:bg-muted/10'}>
                                    <div>
                                        <label className={'apa:block apa:text-xs apa:font-medium apa:text-muted-foreground apa:mb-1'}>
                                            Range Start
                                        </label>
                                        <input
                                            type={'number'}
                                            value={subRuleRangeStart}
                                            onChange={(e) => setSubRuleRangeStart(Number(e.target.value))}
                                            className={'apa:w-40 apa:rounded apa:border apa:border-muted apa:bg-background apa:p-2 apa:text-sm'}
                                        />
                                    </div>
                                    <div>
                                        <label className={'apa:block apa:text-xs apa:font-medium apa:text-muted-foreground apa:mb-1'}>
                                            Range End
                                        </label>
                                        <input
                                            type={'number'}
                                            value={subRuleRangeEnd}
                                            onChange={(e) => setSubRuleRangeEnd(Number(e.target.value))}
                                            className={'apa:w-40 apa:rounded apa:border apa:border-muted apa:bg-background apa:p-2 apa:text-sm'}
                                        />
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

                            <div className={'apa:flex apa:justify-end apa:gap-2 apa:pt-2'}>
                                <Button onClick={() => setActiveProfileForSubRule(null)}>
                                    Cancel
                                </Button>
                                <Button type={'submit'} isLoading={submittingSubRule} disabled={isSubRuleReserved}>
                                    Save Secondary Port
                                </Button>
                            </div>
                        </form>
                    </TitledGreyBox>
                )}
            </div>
        </PageContentBlock>
    );
}
