import React, { useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { Form, Input, Button, Tabs, message, Space } from "antd";
import { UserOutlined, LockOutlined, MailOutlined } from "@ant-design/icons";

const { TabPane } = Tabs;

interface AuthProps {
  onSuccess?: () => void;
}

export default function Auth({ onSuccess }: AuthProps) {
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"signin" | "signup">("signin");

  const handleAuth = async (values: { email: string; password: string }) => {
    const { email, password } = values;
    
    setLoading(true);

    try {
      if (activeTab === "signup") {
        const { error } = await supabase.auth.signUp({ 
          email, 
          password 
        });
        
        if (error) throw error;
        
        message.success("Đăng ký thành công! Hãy kiểm tra email xác nhận.");
        onSuccess?.();
      } else {
        const { error } = await supabase.auth.signInWithPassword({ 
          email, 
          password 
        });
        
        if (error) throw error;
        
        message.success("Đăng nhập thành công!");
        onSuccess?.();
      }
    } catch (err: any) {
      console.error("Auth error:", err);
      message.error(err.message || "Có lỗi xảy ra khi đăng nhập/đăng ký");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: "0 8px" }}>
      <Tabs 
        activeKey={activeTab} 
        onChange={(key) => setActiveTab(key as "signin" | "signup")}
        centered
        size="large"
      >
        <TabPane 
          tab={
            <Space>
              <UserOutlined />
              <span>Đăng nhập</span>
            </Space>
          } 
          key="signin"
        >
          <Form
            name="signin"
            onFinish={handleAuth}
            layout="vertical"
            autoComplete="off"
          >
            <Form.Item
              label="Email"
              name="email"
              rules={[
                { required: true, message: 'Vui lòng nhập email!' },
                { type: 'email', message: 'Email không hợp lệ!' }
              ]}
            >
              <Input 
                prefix={<MailOutlined />} 
                placeholder="Nhập địa chỉ email"
                size="large"
              />
            </Form.Item>

            <Form.Item
              label="Mật khẩu"
              name="password"
              rules={[
                { required: true, message: 'Vui lòng nhập mật khẩu!' },
                { min: 6, message: 'Mật khẩu phải có ít nhất 6 ký tự!' }
              ]}
            >
              <Input.Password 
                prefix={<LockOutlined />} 
                placeholder="Nhập mật khẩu"
                size="large"
              />
            </Form.Item>

            <Form.Item>
              <Button 
                type="primary" 
                htmlType="submit" 
                loading={loading}
                block
                size="large"
              >
                Đăng nhập
              </Button>
            </Form.Item>
          </Form>
        </TabPane>

        <TabPane 
          tab={
            <Space>
              <UserOutlined />
              <span>Đăng ký</span>
            </Space>
          } 
          key="signup"
        >
          <Form
            name="signup"
            onFinish={handleAuth}
            layout="vertical"
            autoComplete="off"
          >
            <Form.Item
              label="Email"
              name="email"
              rules={[
                { required: true, message: 'Vui lòng nhập email!' },
                { type: 'email', message: 'Email không hợp lệ!' }
              ]}
            >
              <Input 
                prefix={<MailOutlined />} 
                placeholder="Nhập địa chỉ email"
                size="large"
              />
            </Form.Item>

            <Form.Item
              label="Mật khẩu"
              name="password"
              rules={[
                { required: true, message: 'Vui lòng nhập mật khẩu!' },
                { min: 6, message: 'Mật khẩu phải có ít nhất 6 ký tự!' }
              ]}
            >
              <Input.Password 
                prefix={<LockOutlined />} 
                placeholder="Nhập mật khẩu (tối thiểu 6 ký tự)"
                size="large"
              />
            </Form.Item>

            <Form.Item>
              <Button 
                type="primary" 
                htmlType="submit" 
                loading={loading}
                block
                size="large"
              >
                Đăng ký tài khoản
              </Button>
            </Form.Item>
          </Form>
        </TabPane>
      </Tabs>

      <div style={{ textAlign: 'center', marginTop: 16 }}>
        <p style={{ color: '#666', fontSize: 14 }}>
          {activeTab === "signin" 
            ? "Chưa có tài khoản? " 
            : "Đã có tài khoản? "}
          <Button 
            type="link" 
            onClick={() => setActiveTab(activeTab === "signin" ? "signup" : "signin")}
            style={{ padding: 0, height: 'auto' }}
          >
            {activeTab === "signin" ? "Đăng ký ngay" : "Đăng nhập ngay"}
          </Button>
        </p>
      </div>
    </div>
  );
}