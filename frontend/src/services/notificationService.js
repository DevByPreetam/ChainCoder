const API_URL = "http://localhost:5000/api";

function getToken() {
  return localStorage.getItem("chaincoder_token");
}

function authHeaders() {
  const token = getToken();
  return {
    Authorization: `Bearer ${token}`,
  };
}

export async function getNotifications() {
  const response = await fetch(`${API_URL}/notifications`, {
    method: "GET",
    headers: authHeaders(),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Unable to fetch notifications");
  }

  return data.notifications || [];
}

export async function getUnreadNotificationCount() {
  const response = await fetch(`${API_URL}/notifications/unread-count`, {
    method: "GET",
    headers: authHeaders(),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Unable to fetch unread notification count");
  }

  return data.unreadCount ?? 0;
}

export async function markNotificationAsRead(notificationId) {
  const response = await fetch(
    `${API_URL}/notifications/${encodeURIComponent(notificationId)}/read`,
    {
      method: "PATCH",
      headers: authHeaders(),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Unable to mark notification as read");
  }

  return data.notification || data;
}
