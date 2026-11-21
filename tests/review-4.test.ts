import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({ Pressable: 'Pressable', StyleSheet: { create: <T,>(x: T) => x }, Text: 'Text', View: 'View' }));

type Report = typeof import('../src/report');
let ErrorBoundary: typeof import('../src/ErrorBoundary').ErrorBoundary;
let scrubEvent: typeof import('../src/monitoring')['scrubEvent'];
let scrub: Report['scrub'], reportError: Report['reportError'], setReporter: Report['setReporter'];

beforeEach(async () => {
  vi.resetModules();
  ({ ErrorBoundary } = await import('../src/ErrorBoundary'));
  ({ scrubEvent } = await import('../src/monitoring'));
  ({ scrub, reportError, setReporter } = await import('../src/report'));
});
afterEach(() => {
  setReporter(null);
  vi.restoreAllMocks();
});

const PEM = '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7\nVJTUt9Us8cKjMzEfYyjiWA4R\n-----END PRIVATE KEY-----';

describe('scrub: plain "key: value" and private keys', () => {
  it.each([
    ['password: hunter2', 'password: [secret]'],
    ['token: abcdefgh', 'token: [secret]'],
    ['refresh_token: 1//0abc', 'refresh_token: [secret]'],
    ['Passcode : 4821', 'Passcode : [secret]'],
    ['api_key:abc;next', 'api_key:[secret];next'],
    ['secret: "two words"', 'secret: [secret]'],
    ['{token: abc, n: 1}', '{token: [secret], n: 1}'],
    ['token: eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOjF9.abc', 'token: [secret]'],
  ])('%s', (input, expected) => expect(scrub(input)).toBe(expected));

  it('hides a whole PEM private key block, also when it is cut short or follows private_key:', () => {
    expect(scrub(`bad key ${PEM} after`)).toBe('bad key [secret] after');
    expect(scrub(`private_key: ${PEM}`)).toBe('private_key: [secret]');
    expect(scrub('-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA')).toBe('[secret]');
    expect(scrub(JSON.stringify({ private_key: PEM }))).toBe('{"private_key":"[secret]"}');
    expect(scrub(`bad key ${PEM}`)).not.toMatch(/MII|VJTU|BEGIN|END/);
  });

  it('leaves ordinary words and colons alone', () => {
    for (const text of ['retry 3 of 5: timeout', 'Error: not found', 'tokens: 3 left']) expect(scrub(text)).toBe(text);
  });

  it('reaches reportError and the crash service (beforeSend)', () => {
    const reporter = vi.fn();
    setReporter(reporter);
    reportError('save', new Error('password: hunter2'));
    expect(reporter.mock.calls[0][1].message).toBe('password: [secret]');
    const event = scrubEvent({ message: `token: abcdefgh ${PEM}`, exception: { values: [{ value: 'password: hunter2' }] } });
    expect(JSON.stringify(event)).not.toMatch(/abcdefgh|hunter2|MII/);
  });
});

describe('ErrorBoundary "Log Out"', () => {
  type Node = { type?: unknown; props?: { onPress?: () => unknown; children?: unknown } } | string | null | undefined | false;
  const buttons = (node: unknown, out: { label: string; press: () => unknown }[] = []) => {
    const n = node as Node;
    if (Array.isArray(n)) n.forEach((c) => buttons(c, out));
    else if (n && typeof n === 'object' && n.props) {
      if (n.type === 'Pressable' && n.props.onPress) out.push({ label: JSON.stringify(n.props.children).match(/"children":"([^"]+)"/)?.[1] ?? '', press: n.props.onPress });
      buttons(n.props.children, out);
    }
    return out;
  };
  const make = (props: Record<string, unknown> = {}) => {
    const b = new ErrorBoundary({ where: 'home', children: 'kids', ...props } as never);
    b.setState = ((s: { error: unknown }) => { b.state = s; }) as never;
    b.state = { error: new Error('x') };
    b.componentDidMount();
    return b;
  };

  it('shows only "Try Again" without onSignOut, and "Log Out" as well with it', () => {
    expect(buttons(make().render()).map((b) => b.label)).toEqual(['Try Again']);
    expect(buttons(make({ onSignOut: () => {} }).render()).map((b) => b.label)).toEqual(['Try Again', 'Log Out']);
    expect(buttons(make({ onSignOut: () => {}, strings: { retry: 'Back to Home', signOut: 'Abmelden' } }).render()).map((b) => b.label)).toEqual(['Back to Home', 'Abmelden']);
  });

  it('signs out, waits for it, then tries the content again', async () => {
    let finish!: () => void;
    const onSignOut = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    const b = make({ onSignOut });
    const pressed = buttons(b.render()).find((x) => x.label === 'Log Out')!.press();
    expect(onSignOut).toHaveBeenCalledOnce();
    expect(b.state.error).not.toBeNull();
    finish();
    await pressed;
    expect(b.state.error).toBeNull();
  });

  it('stays on the screen and reports it when signing out fails', async () => {
    const reporter = vi.fn();
    setReporter(reporter);
    const b = make({ onSignOut: () => Promise.reject(new Error('offline')) });
    await buttons(b.render()).find((x) => x.label === 'Log Out')!.press();
    expect(b.state.error).not.toBeNull();
    expect(reporter).toHaveBeenCalledWith('home', expect.objectContaining({ message: 'offline' }), undefined);
  });

  it('does not touch a screen that has gone away', async () => {
    const b = make({ onSignOut: () => {} });
    const spy = vi.fn();
    b.setState = spy as never;
    b.componentWillUnmount();
    await b.signOut();
    expect(spy).not.toHaveBeenCalled();
  });
});
