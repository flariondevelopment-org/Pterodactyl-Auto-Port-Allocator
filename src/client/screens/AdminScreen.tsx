import { useEffect, useState } from 'react';
import {
    Alert,
    Button,
    http,
    httpErrorToHuman,
    PageContentBlock,
    Spinner,
    TitledGreyBox,
    toast,
} from '@pterodactyl/sdk';
import { Plus } from 'lucide-react';
import { GameProfileCard } from '../components/admin/GameProfileCard';
import { GameProfileModal } from '../components/admin/GameProfileModal';
import { SubRuleModal } from '../components/admin/SubRuleModal';
import type { Egg, GameProfile, SubRule } from '../types/admin';

export default function AdminScreen() {
    const [profiles, setProfiles] = useState<GameProfile[]>([]);
    const [eggs, setEggs] = useState<Egg[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Profile modal state
    const [showProfileModal, setShowProfileModal] = useState(false);
    const [editingProfile, setEditingProfile] = useState<GameProfile | null>(null);

    // Sub-rule modal state
    const [activeProfileForSubRule, setActiveProfileForSubRule] = useState<GameProfile | null>(null);
    const [editingSubRule, setEditingSubRule] = useState<SubRule | null>(null);

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

    const openCreateProfileModal = () => {
        setEditingProfile(null);
        setShowProfileModal(true);
    };

    const openEditProfileModal = (profile: GameProfile) => {
        setEditingProfile(profile);
        setShowProfileModal(true);
    };

    const handleProfileSuccess = (savedProfile: GameProfile, isEdit: boolean) => {
        if (isEdit) {
            setProfiles((prev) =>
                prev.map((p) => (p.id === savedProfile.id ? savedProfile : p))
            );
        } else {
            setProfiles((prev) => [...prev, savedProfile]);
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
    };

    const openEditSubRuleModal = (profile: GameProfile, subRule: SubRule) => {
        setActiveProfileForSubRule(profile);
        setEditingSubRule(subRule);
    };

    const handleSubRuleSuccess = (savedSubRule: SubRule, profileId: number, isEdit: boolean) => {
        setProfiles((prev) =>
            prev.map((p) => {
                if (p.id !== profileId) return p;
                const currentRules = p.sub_rules || [];
                const updatedRules = isEdit
                    ? currentRules.map((r) => (r.id === savedSubRule.id ? savedSubRule : r))
                    : [...currentRules, savedSubRule];
                return {
                    ...p,
                    sub_rules: updatedRules,
                };
            })
        );
    };

    const handleDeleteSubRule = async (profileId: number, subRuleId: number) => {
        if (!window.confirm('Delete this secondary port rule?')) {
            return;
        }

        try {
            await http.delete(`/api/admin/extensions/auto-port-allocator/sub-rules/${subRuleId}`);
            setProfiles((prev) =>
                prev.map((p) => {
                    if (p.id !== profileId) return p;
                    return {
                        ...p,
                        sub_rules: (p.sub_rules || []).filter((r) => r.id !== subRuleId),
                    };
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
        <PageContentBlock title={'Auto Port Allocator Configuration'}>
            <div className={'apa:space-y-6 apa:w-full'}>
                {/* Header Card */}
                <div className={'apa:flex apa:flex-wrap apa:justify-between apa:items-center apa:gap-4 apa:rounded-lg apa:border apa:border-muted apa:bg-card apa:p-6 apa:shadow-sm'}>
                    <div>
                        <h2 className={'apa:text-xl apa:font-bold apa:text-foreground'}>
                            Game Profiles & Auto Port Allocation
                        </h2>
                        <p className={'apa:text-sm apa:text-muted-foreground apa:mt-1'}>
                            Configure game profiles (e.g. MTA, Rust, Palworld) with primary port range restrictions and automatic secondary ports (HTTP, Query, RCON).
                        </p>
                    </div>
                    <Button onClick={openCreateProfileModal} className={'apa:flex apa:items-center apa:gap-2'}>
                        <Plus className={'apa:w-4 apa:h-4'} />
                        <span>Create Game Profile</span>
                    </Button>
                </div>

                {error && <Alert type={'danger'}>{error}</Alert>}

                {/* Profiles List */}
                {profiles.length === 0 ? (
                    <TitledGreyBox title={'Configured Game Profiles'}>
                        <div className={'apa:p-6 apa:text-center apa:space-y-3'}>
                            <p className={'apa:text-muted-foreground apa:text-sm'}>
                                No game profiles configured yet. Click <strong>+ Create Game Profile</strong> above to get started (e.g. for MTA or Rust).
                            </p>
                        </div>
                    </TitledGreyBox>
                ) : (
                    <div className={'apa:space-y-6'}>
                        {profiles.map((profile) => (
                            <GameProfileCard
                                key={profile.id}
                                profile={profile}
                                eggs={eggs}
                                onEditProfile={openEditProfileModal}
                                onDeleteProfile={handleDeleteProfile}
                                onAddSubRule={openSubRuleModal}
                                onEditSubRule={openEditSubRuleModal}
                                onDeleteSubRule={handleDeleteSubRule}
                            />
                        ))}
                    </div>
                )}

                {/* Modals */}
                <GameProfileModal
                    isOpen={showProfileModal}
                    editingProfile={editingProfile}
                    eggs={eggs}
                    onClose={() => {
                        setShowProfileModal(false);
                        setEditingProfile(null);
                    }}
                    onSuccess={handleProfileSuccess}
                />

                <SubRuleModal
                    isOpen={activeProfileForSubRule !== null}
                    activeProfile={activeProfileForSubRule}
                    editingSubRule={editingSubRule}
                    eggs={eggs}
                    onClose={() => {
                        setActiveProfileForSubRule(null);
                        setEditingSubRule(null);
                    }}
                    onSuccess={handleSubRuleSuccess}
                />
            </div>
        </PageContentBlock>
    );
}
