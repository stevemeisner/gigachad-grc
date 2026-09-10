import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  MagnifyingGlassIcon,
  ShieldCheckIcon,
  UserGroupIcon,
  XMarkIcon,
  CheckIcon,
  NoSymbolIcon,
  PlusIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';
import axios from 'axios';
import { usersApi, permissionsApi } from '../lib/api';
import { CreateUserData, UserStatus, UserRole, PermissionGroup } from '../lib/apiTypes';
import toast from 'react-hot-toast';

interface User {
  id: string;
  externalId?: string;
  email: string;
  firstName: string;
  lastName: string;
  displayName: string;
  role: UserRole;
  status: UserStatus;
  lastLoginAt?: string;
  /** False until this account is claimed by its owner's first Google sign-in. */
  hasSignedIn?: boolean;
  groups?: { id: string; name: string }[];
  createdAt: string;
}

/**
 * Rows per page, matching the paged table on the Assets page. Deliberately well
 * under `USER_LIST_MAX_LIMIT` -- this table pages, so it has no reason to pull
 * the server's maximum in one go.
 */
const USERS_PAGE_SIZE = 25;

export default function UserManagement() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [showPermissionsModal, setShowPermissionsModal] = useState(false);
  const [showGroupsModal, setShowGroupsModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [page, setPage] = useState(1);

  // Fetch users. The limit is explicit: relying on the endpoint's default of 50
  // is what silently hid colleagues past the 50th from the administrator.
  const { data: usersData, isLoading: usersLoading } = useQuery({
    queryKey: ['users', search, statusFilter, roleFilter, page],
    queryFn: () => usersApi.list({
      search,
      status: statusFilter as UserStatus || undefined,
      role: roleFilter as UserRole || undefined,
      page,
      limit: USERS_PAGE_SIZE,
    }).then(res => res.data),
  });

  // Fetch user stats
  const { data: statsData } = useQuery({
    queryKey: ['users', 'stats'],
    queryFn: () => usersApi.getStats().then(res => res.data),
  });

  // Fetch permission groups
  const { data: groupsData } = useQuery({
    queryKey: ['permission-groups'],
    queryFn: () => permissionsApi.listGroups().then(res => res.data),
  });

  // Deactivate user mutation
  const deactivateMutation = useMutation({
    mutationFn: (userId: string) => usersApi.deactivate(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('User deactivated');
    },
    onError: () => toast.error('Failed to deactivate user'),
  });

  // Reactivate user mutation
  const reactivateMutation = useMutation({
    mutationFn: (userId: string) => usersApi.reactivate(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('User reactivated');
    },
    onError: () => toast.error('Failed to reactivate user'),
  });

  // Add to group mutation
  const addToGroupMutation = useMutation({
    mutationFn: ({ userId, groupId }: { userId: string; groupId: string }) =>
      usersApi.addToGroup(userId, groupId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['permission-groups'] });
      toast.success('User added to group');
    },
    onError: () => toast.error('Failed to add user to group'),
  });

  // Remove from group mutation
  const removeFromGroupMutation = useMutation({
    mutationFn: ({ userId, groupId }: { userId: string; groupId: string }) =>
      usersApi.removeFromGroup(userId, groupId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['permission-groups'] });
      toast.success('User removed from group');
    },
    onError: () => toast.error('Failed to remove user from group'),
  });

  const users = usersData?.users || [];
  // The real server-side count for the current filters -- not `users.length`,
  // which is only the size of the page in hand.
  const total = usersData?.total ?? 0;
  const isLastPage = page * USERS_PAGE_SIZE >= total;
  // Deactivating or creating a user (or a narrowing filter) can shrink the result
  // set under our feet; don't strand the administrator on a page past the end.
  useEffect(() => {
    if (!usersLoading && total > 0 && users.length === 0 && page > 1) {
      setPage(Math.ceil(total / USERS_PAGE_SIZE));
    }
  }, [usersLoading, total, users.length, page]);
  const groups: PermissionGroup[] = groupsData || [];

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-emerald-500/20 text-emerald-400';
      case 'inactive':
        return 'bg-red-500/20 text-red-400';
      default:
        return 'bg-surface-600 text-surface-300';
    }
  };

  const getRoleBadgeClass = (role: string) => {
    switch (role) {
      case 'admin':
        return 'bg-purple-500/20 text-purple-400';
      case 'compliance_manager':
        return 'bg-blue-500/20 text-blue-400';
      case 'auditor':
        return 'bg-yellow-500/20 text-yellow-400';
      default:
        return 'bg-surface-600 text-surface-300';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">User Management</h1>
          <p className="text-surface-400 mt-1">Manage users, roles, and permissions</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white px-4 py-2 rounded-lg transition-colors"
        >
          <PlusIcon className="w-5 h-5" />
          Add User
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-surface-800 rounded-lg p-4 border border-surface-700">
          <div className="text-surface-400 text-sm">Total Users</div>
          <div className="text-2xl font-bold text-white mt-1">{statsData?.total || 0}</div>
        </div>
        <div className="bg-surface-800 rounded-lg p-4 border border-surface-700">
          <div className="text-surface-400 text-sm">Active Users</div>
          <div className="text-2xl font-bold text-emerald-400 mt-1">{statsData?.active || 0}</div>
        </div>
        <div className="bg-surface-800 rounded-lg p-4 border border-surface-700">
          <div className="text-surface-400 text-sm">Inactive Users</div>
          <div className="text-2xl font-bold text-red-400 mt-1">{statsData?.inactive || 0}</div>
        </div>
        <div className="bg-surface-800 rounded-lg p-4 border border-surface-700">
          <div className="text-surface-400 text-sm">Permission Groups</div>
          <div className="text-2xl font-bold text-brand-400 mt-1">{groups.length}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-surface-800 rounded-lg p-4 border border-surface-700">
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-64">
            <div className="relative">
              <MagnifyingGlassIcon className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
              <input
                type="text"
                placeholder="Search users by name or email..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="w-full bg-surface-900 border border-surface-600 rounded-lg pl-10 pr-4 py-2 text-white placeholder:text-surface-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="bg-surface-900 border border-surface-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <select
            value={roleFilter}
            onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
            className="bg-surface-900 border border-surface-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="">All Roles</option>
            <option value="admin">Admin</option>
            <option value="compliance_manager">Compliance Manager</option>
            <option value="auditor">Auditor</option>
            <option value="viewer">Viewer</option>
          </select>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-surface-800 rounded-lg border border-surface-700 overflow-hidden">
        <table className="w-full">
          <thead className="bg-surface-900">
            <tr>
              <th className="text-left text-surface-400 font-medium px-4 py-3">User</th>
              <th className="text-left text-surface-400 font-medium px-4 py-3">Role</th>
              <th className="text-left text-surface-400 font-medium px-4 py-3">Groups</th>
              <th className="text-left text-surface-400 font-medium px-4 py-3">Status</th>
              <th className="text-left text-surface-400 font-medium px-4 py-3">Last Login</th>
              <th className="text-right text-surface-400 font-medium px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-700">
            {usersLoading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-surface-400">
                  Loading users...
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-surface-400">
                  No users found
                </td>
              </tr>
            ) : (
              users.map((user: User) => (
                <tr key={user.id} className="hover:bg-surface-700/50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-brand-500/20 flex items-center justify-center text-brand-400 font-medium">
                        {user.displayName.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="text-white font-medium">{user.displayName}</div>
                        <div className="text-surface-400 text-sm">{user.email}</div>
                        {!user.hasSignedIn && (
                          <div className="flex items-start gap-1.5 text-amber-400 text-xs mt-1 max-w-md">
                            <ClockIcon className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                            <span>
                              Created, but has not signed in yet. They will be linked on their
                              first Google sign-in.
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getRoleBadgeClass(user.role)}`}>
                      {user.role.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {!user.groups?.length ? (
                        <span className="text-surface-500 text-sm">No groups</span>
                      ) : (
                        user.groups.slice(0, 2).map(group => (
                          <span
                            key={group.id}
                            className="px-2 py-0.5 bg-surface-600 rounded text-xs text-surface-200"
                          >
                            {group.name}
                          </span>
                        ))
                      )}
                      {(user.groups?.length || 0) > 2 && (
                        <span className="text-surface-400 text-xs">+{(user.groups?.length || 0) - 2}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusBadgeClass(user.status)}`}>
                      {user.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-surface-400 text-sm">
                    {user.lastLoginAt
                      ? new Date(user.lastLoginAt).toLocaleDateString()
                      : 'Never'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => {
                          setSelectedUser(user);
                          setShowGroupsModal(true);
                        }}
                        className="p-2 text-surface-400 hover:text-white hover:bg-surface-700 rounded-lg transition-colors"
                        title="Manage Groups"
                      >
                        <UserGroupIcon className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => {
                          setSelectedUser(user);
                          setShowPermissionsModal(true);
                        }}
                        className="p-2 text-surface-400 hover:text-white hover:bg-surface-700 rounded-lg transition-colors"
                        title="View Permissions"
                      >
                        <ShieldCheckIcon className="w-5 h-5" />
                      </button>
                      {user.status === 'active' ? (
                        <button
                          onClick={() => deactivateMutation.mutate(user.id)}
                          className="p-2 text-surface-400 hover:text-red-400 hover:bg-surface-700 rounded-lg transition-colors"
                          title="Deactivate User"
                        >
                          <NoSymbolIcon className="w-5 h-5" />
                        </button>
                      ) : (
                        <button
                          onClick={() => reactivateMutation.mutate(user.id)}
                          className="p-2 text-surface-400 hover:text-emerald-400 hover:bg-surface-700 rounded-lg transition-colors"
                          title="Reactivate User"
                        >
                          <CheckIcon className="w-5 h-5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {total > 0 && (
          <div className="px-4 py-3 border-t border-surface-700 flex items-center justify-between">
            <p className="text-sm text-surface-400">
              Showing {(page - 1) * USERS_PAGE_SIZE + 1} to{' '}
              {Math.min(page * USERS_PAGE_SIZE, total)} of {total} users
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(page - 1)}
                disabled={page === 1}
                className="px-3 py-1 bg-surface-700 rounded text-surface-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-surface-600"
              >
                Previous
              </button>
              <button
                onClick={() => setPage(page + 1)}
                disabled={isLastPage}
                className="px-3 py-1 bg-surface-700 rounded text-surface-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-surface-600"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Groups Modal */}
      {showGroupsModal && selectedUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface-800 rounded-lg w-full max-w-lg mx-4 max-h-[80vh] overflow-hidden">
            <div className="p-4 border-b border-surface-700 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">
                Manage Groups - {selectedUser.displayName}
              </h2>
              <button
                onClick={() => {
                  setShowGroupsModal(false);
                  setSelectedUser(null);
                }}
                className="p-1 text-surface-400 hover:text-white"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-4 overflow-y-auto max-h-[60vh]">
              <div className="text-surface-400 text-sm">
                Select permission groups for this user. Groups provide the initial set of permissions.
              </div>
              <div className="space-y-2">
                {groups.map((group) => {
                  const isMember = selectedUser.groups?.some(g => g.id === group.id) || false;
                  return (
                    <div
                      key={group.id}
                      className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                        isMember
                          ? 'bg-brand-500/20 border-brand-500'
                          : 'bg-surface-700 border-surface-600 hover:border-surface-500'
                      }`}
                      onClick={() => {
                        if (isMember) {
                          removeFromGroupMutation.mutate({
                            userId: selectedUser.id,
                            groupId: group.id,
                          });
                          setSelectedUser({
                            ...selectedUser,
                            groups: (selectedUser.groups || []).filter(g => g.id !== group.id),
                          });
                        } else {
                          addToGroupMutation.mutate({
                            userId: selectedUser.id,
                            groupId: group.id,
                          });
                          setSelectedUser({
                            ...selectedUser,
                            groups: [...(selectedUser.groups || []), { id: group.id, name: group.name }],
                          });
                        }
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-white font-medium flex items-center gap-2">
                            {group.name}
                            {group.isSystem && (
                              <span className="text-xs bg-surface-600 text-surface-300 px-1.5 py-0.5 rounded">
                                System
                              </span>
                            )}
                          </div>
                          <div className="text-surface-400 text-sm">{group.description}</div>
                        </div>
                        {isMember && (
                          <CheckIcon className="w-5 h-5 text-brand-400" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Permissions Modal */}
      {showPermissionsModal && selectedUser && (
        <PermissionsModal
          user={selectedUser}
          onClose={() => {
            setShowPermissionsModal(false);
            setSelectedUser(null);
          }}
        />
      )}

      {/* Create User Modal */}
      {showCreateModal && <CreateUserModal onClose={() => setShowCreateModal(false)} />}
    </div>
  );
}

/**
 * Creating an account here does not create a login. Firebase issues the
 * person's subject id on their first Google sign-in, and the API guard then
 * links that id to this row by matching the verified email address, so the
 * only value this form really needs is the email.
 */
function CreateUserModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [role, setRole] = useState<UserRole>('viewer');
  const [externalId, setExternalId] = useState('');

  const createMutation = useMutation({
    mutationFn: (data: CreateUserData) => usersApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('User created. They can now sign in with Google using that email address.');
      onClose();
    },
    onError: (error: unknown) => {
      const detail = axios.isAxiosError(error)
        ? (error.response?.data as { message?: string } | undefined)?.message
        : undefined;
      toast.error(detail || 'Failed to create user');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      email: email.trim(),
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      role,
      externalId: externalId.trim() || undefined,
    });
  };

  const inputClass =
    'w-full bg-surface-900 border border-surface-600 rounded-lg px-3 py-2 text-white placeholder:text-surface-500 focus:outline-none focus:ring-2 focus:ring-brand-500';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-surface-800 rounded-lg w-full max-w-lg mx-4 max-h-[80vh] overflow-hidden">
        <div className="p-4 border-b border-surface-700 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Add User</h2>
          <button onClick={onClose} className="p-1 text-surface-400 hover:text-white">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="p-4 space-y-4 overflow-y-auto max-h-[60vh]">
            <div className="text-surface-400 text-sm">
              This creates the account, its role and its permissions. It does not create a
              login: tell the person to sign in with Google using the email address below, and
              they will be linked to this account on that first sign-in.
            </div>
            <div>
              <label className="block text-surface-300 text-sm mb-1" htmlFor="new-user-email">
                Email address
              </label>
              <input
                id="new-user-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="colleague@example.com"
                className={inputClass}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-surface-300 text-sm mb-1" htmlFor="new-user-first">
                  First name
                </label>
                <input
                  id="new-user-first"
                  type="text"
                  required
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-surface-300 text-sm mb-1" htmlFor="new-user-last">
                  Last name
                </label>
                <input
                  id="new-user-last"
                  type="text"
                  required
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
            <div>
              <label className="block text-surface-300 text-sm mb-1" htmlFor="new-user-role">
                Role
              </label>
              <select
                id="new-user-role"
                value={role}
                onChange={(e) => setRole(e.target.value as UserRole)}
                className={inputClass}
              >
                <option value="admin">Admin</option>
                <option value="compliance_manager">Compliance Manager</option>
                <option value="auditor">Auditor</option>
                <option value="viewer">Viewer</option>
              </select>
            </div>
            <div>
              <label className="block text-surface-300 text-sm mb-1" htmlFor="new-user-uid">
                Firebase user ID <span className="text-surface-500">(optional)</span>
              </label>
              <input
                id="new-user-uid"
                type="text"
                value={externalId}
                onChange={(e) => setExternalId(e.target.value)}
                placeholder="Leave empty unless you have it from the Firebase console"
                className={inputClass}
              />
            </div>
          </div>
          <div className="p-4 border-t border-surface-700 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-surface-300 hover:text-white hover:bg-surface-700 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white px-4 py-2 rounded-lg transition-colors"
            >
              {createMutation.isPending ? 'Creating...' : 'Create User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PermissionsModal({ user, onClose }: { user: User; onClose: () => void }) {
  const { data: permissionsData, isLoading } = useQuery({
    queryKey: ['user-permissions', user.id],
    queryFn: () => permissionsApi.getUserPermissions(user.id).then(res => res.data),
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-surface-800 rounded-lg w-full max-w-2xl mx-4 max-h-[80vh] overflow-hidden">
        <div className="p-4 border-b border-surface-700 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">
            Permissions - {user.displayName}
          </h2>
          <button onClick={onClose} className="p-1 text-surface-400 hover:text-white">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 overflow-y-auto max-h-[60vh]">
          {isLoading ? (
            <div className="text-center text-surface-400 py-8">Loading permissions...</div>
          ) : (
            <div className="space-y-6">
              {/* Groups */}
              <div>
                <h3 className="text-sm font-medium text-surface-300 mb-2">Groups</h3>
                <div className="flex flex-wrap gap-2">
                  {permissionsData?.groups?.length === 0 ? (
                    <span className="text-surface-500">No groups assigned</span>
                  ) : (
                    permissionsData?.groups?.map((group: any) => (
                      <span
                        key={group.id}
                        className="px-3 py-1 bg-surface-700 rounded-full text-sm text-white"
                      >
                        {group.name}
                      </span>
                    ))
                  )}
                </div>
              </div>

              {/* Effective Permissions */}
              <div>
                <h3 className="text-sm font-medium text-surface-300 mb-2">Effective Permissions</h3>
                <div className="space-y-2">
                  {permissionsData?.effectivePermissions?.length === 0 ? (
                    <span className="text-surface-500">No permissions</span>
                  ) : (
                    permissionsData?.effectivePermissions?.map((perm: any, idx: number) => (
                      <div key={idx} className="bg-surface-700 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-white font-medium capitalize">
                            {perm.resource.replace('_', ' ')}
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded ${
                            perm.source === 'group'
                              ? 'bg-blue-500/20 text-blue-400'
                              : perm.source === 'role'
                                ? 'bg-purple-500/20 text-purple-400'
                                : 'bg-yellow-500/20 text-yellow-400'
                          }`}>
                            {perm.source === 'group'
                              ? `From: ${perm.groupName}`
                              : perm.source === 'role'
                                ? `Role: ${perm.groupName}`
                                : 'Override'}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {perm.actions.map((action: string) => (
                            <span
                              key={action}
                              className="px-2 py-0.5 bg-surface-600 rounded text-xs text-surface-200"
                            >
                              {action}
                            </span>
                          ))}
                        </div>
                        {perm.scope && (
                          <div className="mt-2 text-xs text-surface-400">
                            Scope: {perm.scope.ownership || 'all'}
                            {perm.scope.tags?.length > 0 && ` | Tags: ${perm.scope.tags.join(', ')}`}
                            {perm.scope.categories?.length > 0 && ` | Categories: ${perm.scope.categories.join(', ')}`}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Overrides */}
              {(permissionsData?.overrides?.length ?? 0) > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-surface-300 mb-2">Permission Overrides</h3>
                  <div className="space-y-1">
                    {permissionsData?.overrides?.map((override: any, idx: number) => (
                      <div key={idx} className="flex items-center justify-between bg-surface-700 rounded px-3 py-2">
                        <span className="text-white">{override.permission}</span>
                        <span className={`text-xs px-2 py-0.5 rounded ${
                          override.granted ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                        }`}>
                          {override.granted ? 'Granted' : 'Denied'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}



