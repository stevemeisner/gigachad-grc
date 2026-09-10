import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AxiosResponse } from 'axios';
import { render, screen, waitFor, fireEvent } from '@/test/utils';
import { usersApi, permissionsApi } from '@/lib/api';
import type { User, UserListParams, UserListResponse } from '@/lib/apiTypes';
import UserManagement from './UserManagement';

/**
 * The payload shape here is the one `GET /api/users` really returns
 * (`UserListResponseDto`: users/total/page/limit). The page used to read
 * `data.data`, which made the table permanently empty, so these fixtures are
 * deliberately literal about the wire format.
 *
 * Defaults are installed in `beforeEach` rather than in the factory below, so a
 * test that swaps in its own paging implementation cannot leak it into the next
 * test (`clearAllMocks` clears calls, not implementations).
 */
vi.mock('@/lib/api', () => ({
  usersApi: {
    list: vi.fn(),
    getStats: vi.fn(),
    create: vi.fn(),
    deactivate: vi.fn(),
    reactivate: vi.fn(),
    addToGroup: vi.fn(),
    removeFromGroup: vi.fn(),
  },
  permissionsApi: {
    listGroups: vi.fn(),
    getUserPermissions: vi.fn(),
  },
}));

const SIGNED_IN_USER = {
  id: 'user-1',
  externalId: 'JT7hQ2mVbN4pXcR9sLdKw1zYaB3e',
  email: 'signed.in@example.com',
  firstName: 'Signed',
  lastName: 'In',
  displayName: 'Signed In',
  role: 'admin',
  status: 'active',
  lastLoginAt: '2026-09-01T10:00:00Z',
  hasSignedIn: true,
  groups: [],
  createdAt: '2026-08-01T10:00:00Z',
};

const INVITED_USER = {
  id: 'user-2',
  email: 'invited@example.com',
  firstName: 'Invited',
  lastName: 'Colleague',
  displayName: 'Invited Colleague',
  role: 'viewer',
  status: 'active',
  hasSignedIn: false,
  groups: [],
  createdAt: '2026-09-09T10:00:00Z',
};

/** One more member of a large org, distinguishable by page. */
const rosterUser = (index: number) => ({
  id: `user-${index}`,
  externalId: `ext-${index}`,
  email: `person${index}@example.com`,
  firstName: 'Person',
  lastName: String(index),
  displayName: `Person ${index}`,
  role: 'viewer',
  status: 'active',
  hasSignedIn: true,
  groups: [],
  createdAt: '2026-08-01T10:00:00Z',
});

/** A list payload exactly as `GET /api/users` shapes it. */
const listPayload = (
  users: Record<string, unknown>[],
  total: number,
  page = 1,
): UserListResponse => ({ users, total, page, limit: 25 } as unknown as UserListResponse);

/**
 * These mocks stand in for axios responses, but the component only ever reads
 * `.data`. Asserting the envelope once here beats fabricating a status, headers
 * and config object in every fixture.
 */
const asResponse = <T,>(data: T): AxiosResponse<T> =>
  ({ data }) as unknown as AxiosResponse<T>;

/**
 * A 30-person org across two pages of 25. Serves whichever page was asked for,
 * so a page that never sends `page` is stuck on the first 25 rows.
 */
const installPagedRoster = () => {
  const firstPage = Array.from({ length: 25 }, (_, i) => rosterUser(i + 1));
  const secondPage = Array.from({ length: 5 }, (_, i) => rosterUser(i + 26));
  vi.mocked(usersApi.list).mockImplementation((params?: UserListParams) =>
    Promise.resolve(
      params?.page === 2
        ? asResponse(listPayload(secondPage, 30, 2))
        : asResponse(listPayload(firstPage, 30, 1)),
    ),
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(usersApi.list).mockResolvedValue(
    asResponse(listPayload([SIGNED_IN_USER, INVITED_USER], 2)),
  );
  vi.mocked(usersApi.getStats).mockResolvedValue(
    asResponse({ total: 2, active: 2, inactive: 0, byRole: [{ role: 'admin', count: 1 }] }),
  );
  vi.mocked(usersApi.create).mockResolvedValue(asResponse({ id: 'user-3' } as unknown as User));
  vi.mocked(usersApi.deactivate).mockResolvedValue(asResponse({} as unknown as User));
  vi.mocked(usersApi.reactivate).mockResolvedValue(asResponse({} as unknown as User));
  vi.mocked(usersApi.addToGroup).mockResolvedValue(asResponse(undefined));
  vi.mocked(usersApi.removeFromGroup).mockResolvedValue(asResponse(undefined));
  vi.mocked(permissionsApi.listGroups).mockResolvedValue(asResponse([]));
  vi.mocked(permissionsApi.getUserPermissions).mockResolvedValue(asResponse([]));
});

describe('UserManagement', () => {
  it('lists the users the API returned', async () => {
    render(<UserManagement />);

    await waitFor(() => {
      expect(screen.getByText('Signed In')).toBeInTheDocument();
    });
    expect(screen.getByText('invited@example.com')).toBeInTheDocument();
  });

  it('explains the pending state only for an account that has never signed in', async () => {
    render(<UserManagement />);

    await waitFor(() => {
      expect(screen.getByText(/has not signed in yet/i)).toBeInTheDocument();
    });
    expect(screen.getAllByText(/has not signed in yet/i)).toHaveLength(1);
    expect(screen.getByText(/linked on their first Google sign-in/i)).toBeInTheDocument();
  });

  it('creates a user from an email address alone, with no Firebase id', async () => {
    render(<UserManagement />);

    await waitFor(() => {
      expect(screen.getByText('Signed In')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /add user/i }));
    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: 'newhire@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/first name/i), { target: { value: 'New' } });
    fireEvent.change(screen.getByLabelText(/last name/i), { target: { value: 'Hire' } });
    fireEvent.click(screen.getByRole('button', { name: /create user/i }));

    await waitFor(() => {
      expect(usersApi.create).toHaveBeenCalledWith({
        email: 'newhire@example.com',
        firstName: 'New',
        lastName: 'Hire',
        role: 'viewer',
        externalId: undefined,
      });
    });
  });

  /**
   * Accepting the endpoint's default limit is the original defect: the server
   * serves 50 rows and says nothing, so user 51 simply is not there.
   */
  it('requests an explicit page size rather than relying on the server default', async () => {
    render(<UserManagement />);

    await waitFor(() => {
      expect(usersApi.list).toHaveBeenCalled();
    });

    const params = vi.mocked(usersApi.list).mock.calls[0][0];
    expect(params?.limit).toEqual(expect.any(Number));
    expect(params?.limit).toBeGreaterThan(0);
    // Past MAX_PAGINATION_LIMIT the server's PaginationLimitPipe silently clamps,
    // which would reintroduce exactly this invisible truncation.
    expect(params?.limit).toBeLessThanOrEqual(100);
  });

  it('pages through a roster larger than one page and reports its true total', async () => {
    installPagedRoster();

    render(<UserManagement />);

    await waitFor(() => {
      expect(screen.getByText('Person 1')).toBeInTheDocument();
    });
    // The count must be the server's total, not the 25 rows in hand.
    expect(screen.getByText(/of 30 users/)).toBeInTheDocument();
    expect(screen.queryByText('Person 26')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    await waitFor(() => {
      expect(screen.getByText('Person 26')).toBeInTheDocument();
    });
    expect(usersApi.list).toHaveBeenCalledWith(expect.objectContaining({ page: 2 }));
    expect(screen.queryByText('Person 1')).not.toBeInTheDocument();
  });

  it('stops paging at the ends of the roster', async () => {
    installPagedRoster();

    render(<UserManagement />);

    await waitFor(() => {
      expect(screen.getByText('Person 1')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /previous/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /next/i })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: /next/i }));

    await waitFor(() => {
      expect(screen.getByText('Person 26')).toBeInTheDocument();
    });
    // 30 users, 25 per page: page 2 is the last one.
    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /previous/i })).toBeEnabled();
  });
});
