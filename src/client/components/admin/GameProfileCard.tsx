import { Badge, Button } from '@pterodactyl/sdk';
import { Pencil, Trash2 } from 'lucide-react';
import type { Egg, GameProfile, SubRule } from '../../types/admin';
import { getProfileEggIds } from '../../types/admin';
import { formatRangesDisplay } from '../../utils/ranges';

interface GameProfileCardProps {
    profile: GameProfile;
    eggs: Egg[];
    onEditProfile: (profile: GameProfile) => void;
    onDeleteProfile: (profileId: number) => void;
    onAddSubRule: (profile: GameProfile) => void;
    onEditSubRule: (profile: GameProfile, subRule: SubRule) => void;
    onDeleteSubRule: (profileId: number, subRuleId: number) => void;
}

export function GameProfileCard({
    profile,
    eggs,
    onEditProfile,
    onDeleteProfile,
    onAddSubRule,
    onEditSubRule,
    onDeleteSubRule,
}: GameProfileCardProps) {
    const primaryDisplay = formatRangesDisplay(
        profile.primary_port_ranges,
        profile.primary_range_start,
        profile.primary_range_end
    );

    return (
        <div className={'apa:rounded-lg apa:border apa:border-muted apa:bg-card apa:shadow-sm apa:p-5 apa:space-y-4'}>
            {/* Profile Header */}
            <div className={'apa:flex apa:flex-wrap apa:justify-between apa:items-start apa:gap-4 apa:pb-3 apa:border-b apa:border-muted'}>
                <div>
                    <div className={'apa:flex apa:items-center apa:gap-3 apa:flex-wrap'}>
                        <h3 className={'apa:text-lg apa:font-bold apa:text-foreground'}>{profile.name}</h3>
                        {getProfileEggIds(profile).map((eid) => {
                            const matched = eggs.find((e) => e.id === eid) || profile.eggs?.find((e) => e.id === eid);
                            return (
                                <Badge key={eid} tone={'accent'} variant={'solid'}>
                                    Egg: {matched?.name || `Egg #${eid}`}
                                </Badge>
                            );
                        })}
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
                    <Button
                        size={'small'}
                        color={'grey'}
                        isSecondary
                        onClick={() => onEditProfile(profile)}
                        className={'apa:flex apa:items-center apa:gap-1.5'}
                        title={'Edit Game Profile'}
                    >
                        <Pencil className={'apa:w-3.5 apa:h-3.5'} />
                        <span>Edit Game</span>
                    </Button>
                    <Button
                        size={'small'}
                        color={'red'}
                        onClick={() => onDeleteProfile(profile.id)}
                        className={'apa:flex apa:items-center apa:gap-1.5'}
                        title={'Delete Game Profile'}
                    >
                        <Trash2 className={'apa:w-3.5 apa:h-3.5'} />
                        <span>Delete</span>
                    </Button>
                </div>
            </div>

            {/* Side Ports Table Inside The Box */}
            <div className={'apa:rounded-lg apa:border-2 apa:border-slate-700 apa:bg-slate-900/60 apa:overflow-hidden apa:shadow-md'}>
                <div className={'apa:px-4 apa:py-3 apa:bg-slate-800/90 apa:border-b-2 apa:border-slate-700 apa:flex apa:justify-between apa:items-center'}>
                    <div className={'apa:flex apa:items-center apa:gap-2'}>
                        <span className={'apa:text-xs apa:font-bold apa:uppercase apa:tracking-wider apa:text-slate-200'}>
                            Game Ports & Side Ports Configuration
                        </span>
                        <Badge tone={'neutral'} variant={'soft'}>
                            {(profile.sub_rules?.length || 0) + 1} Port Rules
                        </Badge>
                    </div>
                    <Button size={'xsmall'} onClick={() => onAddSubRule(profile)}>
                        + Add Side Port
                    </Button>
                </div>

                <div className={'apa:overflow-x-auto'}>
                    <table className={'apa:w-full apa:text-left apa:border-collapse'}>
                        <thead>
                            <tr className={'apa:border-b-2 apa:border-slate-700 apa:bg-slate-800/70 apa:text-xs apa:text-slate-300 apa:uppercase apa:tracking-wider'}>
                                <th className={'apa:py-3.5 apa:px-4 apa:font-semibold apa:border-r apa:border-slate-700/80 last:apa:border-r-0 apa:whitespace-nowrap'}>Service / Role</th>
                                <th className={'apa:py-3.5 apa:px-4 apa:font-semibold apa:border-r apa:border-slate-700/80 last:apa:border-r-0 apa:whitespace-nowrap'}>Environment Key</th>
                                <th className={'apa:py-3.5 apa:px-4 apa:font-semibold apa:border-r apa:border-slate-700/80 last:apa:border-r-0 apa:whitespace-nowrap'}>Port Type</th>
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
                                <td className={'apa:py-3.5 apa:px-4 apa:border-r apa:border-slate-700/50 apa:whitespace-nowrap'}>
                                    <Badge tone={'neutral'} variant={'soft'}>
                                        {primaryDisplay !== 'Any Allowed' ? 'Range' : 'Any Free'}
                                    </Badge>
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
                                        <Button
                                            size={'xsmall'}
                                            color={'grey'}
                                            isSecondary
                                            onClick={() => onEditProfile(profile)}
                                            className={'apa:flex apa:items-center apa:gap-1.5'}
                                            title={'Edit Game & Primary Port'}
                                        >
                                            <Pencil className={'apa:w-3.5 apa:h-3.5'} />
                                            <span>Edit</span>
                                        </Button>
                                    </div>
                                </td>
                            </tr>

                            {/* Secondary Side Ports */}
                            {profile.sub_rules && profile.sub_rules.length > 0 ? (
                                profile.sub_rules.map((subRule) => (
                                    <tr key={subRule.id} className={'apa:border-b apa:border-slate-700/60 last:apa:border-b-0 apa:hover:bg-slate-800/40 apa:transition-colors'}>
                                        <td className={'apa:py-3.5 apa:px-4 apa:font-medium apa:border-r apa:border-slate-700/50'}>
                                            <div className={'apa:flex apa:items-center apa:gap-2 apa:whitespace-nowrap'}>
                                                <span className={'apa:text-slate-200'}>{subRule.name}</span>
                                                <Badge tone={'neutral'} variant={'soft'}>Side Port</Badge>
                                            </div>
                                        </td>
                                        <td className={'apa:py-3.5 apa:px-4 apa:border-r apa:border-slate-700/50 apa:whitespace-nowrap'}>
                                            <span className={'apa:font-mono apa:text-xs apa:font-bold apa:text-primary'}>
                                                {subRule.env_variable}
                                            </span>
                                        </td>
                                        <td className={'apa:py-3.5 apa:px-4 apa:border-r apa:border-slate-700/50 apa:whitespace-nowrap'}>
                                            <Badge tone={'accent'} variant={'soft'}>
                                                {subRule.allocation_type === 'offset'
                                                    ? 'Fixed Offset'
                                                    : subRule.allocation_type === 'range'
                                                      ? 'Range'
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
                                                <Button
                                                    size={'xsmall'}
                                                    color={'grey'}
                                                    isSecondary
                                                    onClick={() => onEditSubRule(profile, subRule)}
                                                    className={'apa:flex apa:items-center apa:gap-1.5'}
                                                    title={'Edit Side Port Rule'}
                                                >
                                                    <Pencil className={'apa:w-3.5 apa:h-3.5'} />
                                                    <span>Edit</span>
                                                </Button>
                                                <Button
                                                    size={'xsmall'}
                                                    color={'red'}
                                                    onClick={() => onDeleteSubRule(profile.id, subRule.id)}
                                                    className={'apa:flex apa:items-center apa:gap-1.5'}
                                                    title={'Delete Side Port Rule'}
                                                >
                                                    <Trash2 className={'apa:w-3.5 apa:h-3.5'} />
                                                    <span>Delete</span>
                                                </Button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={7} className={'apa:py-6 apa:px-4 apa:text-center apa:text-xs apa:text-slate-400'}>
                                        No side ports configured yet for {profile.name}.{' '}
                                        <button
                                            onClick={() => onAddSubRule(profile)}
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
}
