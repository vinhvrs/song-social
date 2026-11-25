"use client";
import { useState } from "react";
import { errorMessage, mutate } from "@/lib/api";
import type { User } from "@/lib/types";
import { Icon, Modal } from "./ui";
export function AuthModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: (user: User) => void;
}) {
  const [register, setRegister] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const user = await mutate<User>(
        register ? "/auth/register" : "/auth/login",
        "POST",
        fields,
      );
      onSuccess(user);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPending(false);
    }
  }
  return (
    <Modal
      title={register ? "Tìm người cùng tần số" : "Chào mừng bạn trở lại"}
      onClose={onClose}
    >
      <p className="modal-intro">
        {register
          ? "Tạo một góc nhỏ cho gu nhạc của bạn. Bắt đầu từ một bài hát."
          : "Đăng nhập để lưu, chia sẻ và kết nối qua âm nhạc."}
      </p>
      <form onSubmit={submit} className="stack-form">
        {register && (
          <>
            <label>
              Tên hiển thị
              <input
                name="displayName"
                required
                maxLength={60}
                autoComplete="name"
                placeholder="Mọi người gọi bạn là gì?"
              />
            </label>
            <label>
              Tên người dùng
              <input
                name="handle"
                required
                minLength={3}
                maxLength={24}
                pattern="[a-z0-9_]+"
                autoComplete="username"
                placeholder="ten_cua_ban"
              />
              <small>3–24 ký tự: chữ thường, số và dấu gạch dưới.</small>
            </label>
          </>
        )}
        <label>
          Email
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            maxLength={254}
            placeholder="ban@example.com"
          />
        </label>
        <label>
          Mật khẩu
          <input
            name="password"
            type="password"
            autoComplete={register ? "new-password" : "current-password"}
            minLength={register ? 10 : undefined}
            maxLength={72}
            required
            placeholder={register ? "Ít nhất 10 ký tự" : "Mật khẩu của bạn"}
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="primary-button full-width" disabled={pending}>
          {pending ? "Đang xử lý…" : register ? "Tạo tài khoản" : "Đăng nhập"}
        </button>
      </form>
      <div className="auth-switch">
        {register ? "Bạn đã có tài khoản?" : "Chưa có tài khoản?"}{" "}
        <button
          className="text-link"
          onClick={() => {
            setRegister(!register);
            setError("");
          }}
        >
          {register ? "Đăng nhập" : "Đăng ký"}
        </button>
      </div>
    </Modal>
  );
}
export function EditProfileModal({
  user,
  onClose,
  onSuccess,
}: {
  user: User;
  onClose: () => void;
  onSuccess: (user: User) => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError("");
    try {
      onSuccess(
        await mutate<User>(
          "/users/me",
          "PATCH",
          Object.fromEntries(new FormData(e.currentTarget)),
        ),
      );
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPending(false);
    }
  }
  return (
    <Modal title="Chỉnh sửa hồ sơ" onClose={onClose}>
      <form className="stack-form" onSubmit={submit}>
        <label>
          Tên hiển thị
          <input
            name="displayName"
            required
            maxLength={60}
            defaultValue={user.displayName}
          />
        </label>
        <label>
          Một chút về bạn
          <textarea
            name="bio"
            maxLength={280}
            rows={4}
            defaultValue={user.bio}
            placeholder="Gu nhạc, cảm hứng và những điều bạn yêu thích…"
          />
        </label>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <button className="primary-button" disabled={pending}>
          <Icon name="check" size={18} />
          {pending ? "Đang lưu…" : "Lưu hồ sơ"}
        </button>
      </form>
    </Modal>
  );
}
