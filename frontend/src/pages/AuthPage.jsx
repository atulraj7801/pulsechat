import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema as login, registerSchema as register } from '../features/auth/schemas';
import { ArrowRight, ArrowUpRight, Check, LockKeyhole, MessagesSquare, Radio } from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../stores/auth';
import { Brand } from '../components/common/Brand';
export function AuthPage({ mode = 'login' }) {
  const signup = mode === 'register',
    navigate = useNavigate();
  const {
    register: field,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm({ resolver: zodResolver(signup ? register : login) });
  async function submit(data) {
    try {
      useAuth.getState().setSession(await api(`/auth/${mode}`, { method: 'POST', body: data }));
      navigate('/app', { replace: true });
    } catch (err) {
      if (err.fields?.length) for (const field of err.fields) setError(field.path, { message: field.message });
      else setError('root', { message: err.message });
    }
  }
  return (
    <main className="auth-page">
      <section className="auth-story">
        <Brand />
        <div className="auth-story-content">
          <div className="eyebrow">
            <span className="live-dot" /> BUILT FOR YOUR TEAM’S RHYTHM
          </div>
          <h1>
            Good work starts
            <br />
            with a great
            <br />
            <span>conversation.</span>
          </h1>
          <p>
            A home for ideas, quick questions, and the people who make it all happen. Find your
            flow, together.
          </p>
          <div className="auth-preview">
            <div className="flex items-center gap-3">
              <span className="mini-avatar">JL</span>
              <div>
                <strong>One place. Every conversation.</strong>
                <small>Your team, a little more connected.</small>
              </div>
              <MessagesSquare className="ml-auto" size={22} />
            </div>
            <div className="auth-preview-line">
              <span>
                <Check size={13} /> In sync
              </span>
              <span>
                <Radio size={13} /> In real time
              </span>
              <span>
                <LockKeyhole size={13} /> Secure by design
              </span>
            </div>
          </div>
        </div>
        <div className="auth-footer">
          Less noise. More connection.
          <span>
            Meet PulseChat <ArrowUpRight size={14} />
          </span>
        </div>
      </section>
      <section className="auth-form-side">
        <div className="mobile-brand">
          <Brand />
        </div>
        <div className="auth-form-wrap">
          <span className="eyebrow text-accent">YOUR WORKSPACE AWAITS</span>
          <h2>{signup ? 'Make room for great work.' : 'Welcome back.'}</h2>
          <p className="text-muted">
            {signup
              ? 'Create your account and get into the conversation.'
              : 'Pick up where the conversation left off.'}
          </p>
          <form onSubmit={handleSubmit(submit)} className="auth-form" noValidate>
            {signup && (
              <>
                <label>
                  Full name
                  <input autoComplete="name" placeholder="Alex Morgan" {...field('display_name')} />
                  {errors.display_name && (
                    <small className="field-error">{errors.display_name.message}</small>
                  )}
                </label>
                <label>
                  Username
                  <input autoComplete="username" placeholder="alexmorgan" {...field('username')} />
                  {errors.username && (
                    <small className="field-error">{errors.username.message}</small>
                  )}
                </label>
              </>
            )}
            <label>
              Work email
              <input
                type="email"
                autoComplete="email"
                placeholder="you@company.com"
                {...field('email')}
              />
              {errors.email && <small className="field-error">{errors.email.message}</small>}
            </label>
            <label>
              Password
              <input
                type="password"
                autoComplete={signup ? 'new-password' : 'current-password'}
                placeholder={signup ? 'At least 12 characters' : 'Enter your password'}
                {...field('password')}
              />
              {errors.password && <small className="field-error">{errors.password.message}</small>}
            </label>
            {errors.root && (
              <div className="form-error" role="alert">
                {errors.root.message}
              </div>
            )}
            <button className="button primary" disabled={isSubmitting}>
              {isSubmitting ? 'One moment…' : signup ? 'Create account' : 'Sign in to PulseChat'}
              <ArrowRight size={17} />
            </button>
          </form>
          <p className="auth-switch">
            {signup ? 'Already part of the conversation?' : 'New to PulseChat?'}{' '}
            <Link to={signup ? '/login' : '/register'}>
              {signup ? 'Sign in' : 'Create an account'}
            </Link>
          </p>
          <div className="auth-security">
            <LockKeyhole size={14} /> Your conversations stay with your team.
          </div>
        </div>
        <p className="auth-bottom">A little more connected.</p>
      </section>
    </main>
  );
}
