import { useEffect, useState } from 'react';
import { Button, http, httpErrorToHuman, toast } from '@pterodactyl/sdk';
import { Plus, Trash2 } from 'lucide-react';
import { useDynamicRanges } from '../../hooks/useDynamicRanges';
import type { Egg, GameProfile } from '../../types/admin';
import { getProfileEggIds } from '../../types/admin';
import { extractValidRanges } from '../../utils/ranges';

interface GameProfileModalProps {
    isOpen: boolean;
    editingProfile: GameProfile | null;
    eggs: Egg[];
    onClose: () => void;
    onSuccess: (profile: GameProfile, isEdit: boolean) => void;
}

export function GameProfileModal({
    isOpen,
    editingProfile,
    eggs,
    onClose,
    onSuccess,
}: GameProfileModalProps) {
    const [profileName, setProfileName] = useState('');
    const [profileDescription, setProfileDescription] = useState('');
    const [profileEggIds, setProfileEggIds] = useState<number[]>([]);
    const [eggSearch, setEggSearch] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const {
        ranges: primaryRanges,
        addRange: addPrimaryRange,
        removeRange: removePrimaryRange,
        updateRange: updatePrimaryRange,
        resetRanges,
    } = useDynamicRanges([{ start: '', end: '' }]);

    useEffect(() => {
        if (!isOpen) return;

        if (editingProfile) {
            setProfileName(editingProfile.name);
            setProfileDescription(editingProfile.description || '');
            setProfileEggIds(getProfileEggIds(editingProfile));
            setEggSearch('');

            if (editingProfile.primary_port_ranges && editingProfile.primary_port_ranges.length > 0) {
                resetRanges(editingProfile.primary_port_ranges.map((r) => ({ start: r.start, end: r.end })));
            } else if (editingProfile.primary_range_start && editingProfile.primary_range_end) {
                resetRanges([{ start: editingProfile.primary_range_start, end: editingProfile.primary_range_end }]);
            } else {
                resetRanges([{ start: '', end: '' }]);
            }
        } else {
            setProfileName('');
            setProfileDescription('');
            setProfileEggIds(eggs.length > 0 ? [eggs[0].id] : []);
            setEggSearch('');
            resetRanges([{ start: '', end: '' }]);
        }
    }, [isOpen, editingProfile]);

    if (!isOpen) return null;

    const filteredEggs = eggs.filter((e) =>
        e.name.toLowerCase().includes(eggSearch.toLowerCase()) || String(e.id).includes(eggSearch)
    );

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!profileName.trim() || profileEggIds.length === 0) {
            toast.error('Please enter a game name and select at least one Egg.');
            return;
        }

        const validRanges = extractValidRanges(primaryRanges);

        try {
            setSubmitting(true);
            const payload = {
                name: profileName.trim(),
                egg_ids: profileEggIds,
                egg_id: profileEggIds[0],
                description: profileDescription.trim() || null,
                primary_port_ranges: validRanges.length > 0 ? validRanges : null,
            };

            if (editingProfile) {
                const res = await http.put(`/api/admin/extensions/auto-port-allocator/profiles/${editingProfile.id}`, payload);
                toast.success(`Game profile "${res.data.profile.name}" updated!`);
                onSuccess(res.data.profile, true);
            } else {
                const res = await http.post('/api/admin/extensions/auto-port-allocator/profiles', payload);
                toast.success(`Game profile "${res.data.profile.name}" created!`);
                onSuccess(res.data.profile, false);
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
                            {editingProfile ? `Edit Game Profile: "${editingProfile.name}"` : 'Create New Game Profile'}
                        </h3>
                        <p className={'apa:text-xs apa:text-muted-foreground'}>
                            Configure a game template with primary port range restrictions.
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
                        {/* Game Profile Name */}
                        <div>
                            <label className={'apa:block apa:text-xs apa:font-medium apa:text-muted-foreground apa:mb-1'}>
                                Game Profile Name *
                            </label>
                            <input
                                type={'text'}
                                value={profileName}
                                onChange={(e) => setProfileName(e.target.value)}
                                placeholder={'e.g. MTA (Multi Theft Auto), Rust, Minecraft'}
                                className={'apa:w-full apa:rounded apa:border apa:border-muted apa:bg-background apa:p-2 apa:text-sm'}
                                required
                            />
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
                    </div>

                    {/* Target Eggs Multi-Select */}
                    <div className={'apa:rounded-lg apa:border apa:border-muted apa:p-3 apa:bg-muted/10 apa:space-y-3'}>
                        <div className={'apa:flex apa:flex-wrap apa:justify-between apa:items-center apa:gap-2'}>
                            <div>
                                <label className={'apa:block apa:text-xs apa:font-semibold apa:text-foreground'}>
                                    Target Egg(s) * ({profileEggIds.length} selected)
                                </label>
                                <p className={'apa:text-xs apa:text-muted-foreground'}>
                                    Select all game eggs that share this profile&apos;s port allocation rules.
                                </p>
                            </div>
                            <div className={'apa:flex apa:items-center apa:gap-2'}>
                                <button
                                    type={'button'}
                                    onClick={() => {
                                        const filteredIds = filteredEggs.map((e) => e.id);
                                        setProfileEggIds((prev) => Array.from(new Set([...prev, ...filteredIds])));
                                    }}
                                    className={'apa:text-xs apa:text-primary apa:hover:underline apa:cursor-pointer'}
                                >
                                    Select All
                                </button>
                                <span className={'apa:text-muted-foreground apa:text-xs'}>|</span>
                                <button
                                    type={'button'}
                                    onClick={() => setProfileEggIds([])}
                                    className={'apa:text-xs apa:text-muted-foreground apa:hover:text-foreground apa:cursor-pointer'}
                                >
                                    Clear All
                                </button>
                            </div>
                        </div>

                        {/* Search & Filter */}
                        <input
                            type={'text'}
                            value={eggSearch}
                            onChange={(e) => setEggSearch(e.target.value)}
                            placeholder={'Search eggs by name or ID...'}
                            className={'apa:w-full apa:rounded apa:border apa:border-muted apa:bg-background apa:p-2 apa:text-xs'}
                        />

                        {/* Selected Egg Chips */}
                        {profileEggIds.length > 0 && (
                            <div className={'apa:flex apa:flex-wrap gap-1.5'}>
                                {profileEggIds.map((id) => {
                                    const egg = eggs.find((e) => e.id === id);
                                    return (
                                        <span
                                            key={id}
                                            className={'apa:inline-flex apa:items-center apa:gap-1.5 apa:bg-primary/20 apa:text-primary apa:border apa:border-primary/40 apa:rounded-md apa:px-2 apa:py-0.5 apa:text-xs apa:font-medium'}
                                        >
                                            <span>{egg ? egg.name : `Egg #${id}`}</span>
                                            <button
                                                type={'button'}
                                                onClick={() => setProfileEggIds((prev) => prev.filter((item) => item !== id))}
                                                className={'apa:hover:text-red-400 apa:cursor-pointer apa:font-bold apa:ml-0.5'}
                                                title={'Remove'}
                                            >
                                                ✕
                                            </button>
                                        </span>
                                    );
                                })}
                            </div>
                        )}

                        {/* Scrollable Egg Checkbox List */}
                        <div className={'apa:max-h-44 apa:overflow-y-auto apa:rounded apa:border apa:border-muted apa:bg-background/80 apa:divide-y apa:divide-muted/40'}>
                            {filteredEggs.length === 0 ? (
                                <div className={'apa:p-3 apa:text-center apa:text-xs apa:text-muted-foreground'}>
                                    No eggs match your search.
                                </div>
                            ) : (
                                filteredEggs.map((egg) => {
                                    const isSelected = profileEggIds.includes(egg.id);
                                    return (
                                        <label
                                            key={egg.id}
                                            className={`apa:flex apa:items-center apa:gap-3 apa:p-2 apa:cursor-pointer apa:transition-colors apa:text-xs ${
                                                isSelected ? 'apa:bg-primary/10' : 'apa:hover:bg-muted/20'
                                            }`}
                                        >
                                            <input
                                                type={'checkbox'}
                                                checked={isSelected}
                                                onChange={() => {
                                                    setProfileEggIds((prev) =>
                                                        isSelected ? prev.filter((id) => id !== egg.id) : [...prev, egg.id]
                                                    );
                                                }}
                                                className={'apa:rounded apa:border-muted apa:text-primary apa:cursor-pointer'}
                                            />
                                            <span className={'apa:font-medium apa:text-foreground'}>
                                                {egg.name}
                                            </span>
                                            <span className={'apa:text-muted-foreground apa:text-[11px]'}>
                                                (Egg #{egg.id})
                                            </span>
                                        </label>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    {/* Multiple Primary Port Ranges */}
                    <div className={'apa:rounded-lg apa:border apa:border-muted apa:p-3 apa:bg-muted/10 apa:space-y-3'}>
                        <div className={'apa:flex apa:justify-between apa:items-center apa:gap-3'}>
                            <div>
                                <label className={'apa:block apa:text-xs apa:font-semibold apa:text-foreground'}>
                                    Primary Port (SERVER_PORT) Allowed Range(s)
                                </label>
                                <p className={'apa:text-xs apa:text-muted-foreground'}>
                                    You can define one or more port ranges (e.g. 22003–22050 and 22100–22150). Leave blank for any port.
                                </p>
                            </div>
                            <Button
                                size={'xsmall'}
                                type={'button'}
                                onClick={addPrimaryRange}
                                className={'apa:flex apa:items-center apa:gap-1.5 apa:whitespace-nowrap'}
                            >
                                <Plus className={'apa:w-3.5 apa:h-3.5'} />
                                <span>Add Another Range</span>
                            </Button>
                        </div>

                        <div className={'apa:space-y-2'}>
                            {primaryRanges.map((range, idx) => (
                                <div key={idx} className={'apa:flex apa:items-center apa:gap-2'}>
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
                                        <Button
                                            size={'xsmall'}
                                            color={'red'}
                                            type={'button'}
                                            onClick={() => removePrimaryRange(idx)}
                                            title={'Remove Range'}
                                            className={'apa:p-1.5'}
                                        >
                                            <Trash2 className={'apa:w-3.5 apa:h-3.5'} />
                                        </Button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Modal Footer */}
                    <div className={'apa:flex apa:justify-end apa:gap-2 apa:pt-2 apa:border-t apa:border-muted'}>
                        <Button onClick={onClose}>
                            Cancel
                        </Button>
                        <Button type={'submit'} isLoading={submitting}>
                            {editingProfile ? 'Update Game Profile' : 'Create Game Profile'}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}
