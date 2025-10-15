import { useState } from "react";
import { supabase } from "../lib/supabaseClient";
import {
  Form,
  Input,
  Upload,
  Button,
  Card,
  message,
  Space,
  Typography,
  Progress,
  List,
  Tag,
  Modal,
  Alert,
  Select,
} from "antd";
import {
  UploadOutlined,
  UserOutlined,
  PaperClipOutlined,
  DeleteOutlined,
  PlusOutlined,
  CloseOutlined,
  TagOutlined,
} from "@ant-design/icons";

const { Text } = Typography;
const { Dragger } = Upload;
const { Option } = Select;

interface UploadJob {
  id: string;
  file: File;
  fullName: string;
  appliedPosition: string;
  skills: string[];
  progress: number;
  status: "pending" | "uploading" | "completed" | "error";
  error?: string;
}

const MAX_CONCURRENT_UPLOADS = 3;
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_FILE_TYPES = ["application/pdf"];

// Predefined skills for suggestions
const SKILLS_SUGGESTIONS = [
  "React",
  "TypeScript",
  "JavaScript",
  "Node.js",
  "Python",
  "Java",
  "HTML",
  "CSS",
  "Vue.js",
  "Angular",
  "Next.js",
  "Express.js",
  "MongoDB",
  "PostgreSQL",
  "MySQL",
  "Redis",
  "Docker",
  "AWS",
  "Git",
  "REST API",
  "GraphQL",
  "Firebase",
  "Tailwind CSS",
  "SASS",
  "React Native",
  "Flutter",
  "Swift",
  "Kotlin",
  "Go",
  "PHP",
  "Machine Learning",
  "Data Analysis",
  "UI/UX Design",
  "Figma",
];

export default function CandidateForm({
  onCreated,
}: {
  onCreated?: () => void;
}) {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [uploadJobs, setUploadJobs] = useState<UploadJob[]>([]);
  const [isModalVisible, setIsModalVisible] = useState(false);

  const processUploadQueue = async (jobs: UploadJob[]) => {
    const queue = [...jobs];
    const activeJobs: UploadJob[] = [];
    const results: { success: number; errors: number } = {
      success: 0,
      errors: 0,
    };

    const processNext = async (): Promise<void> => {
      if (queue.length === 0 && activeJobs.length === 0) {
        setLoading(false);
        if (results.success > 0) {
          message.success(`Đã tạo thành công ${results.success} hồ sơ`);
          form.resetFields();
          setUploadJobs([]);
          onCreated?.();
        }
        if (results.errors > 0) {
          message.error(`${results.errors} hồ sơ thất bại`);
        }
        return;
      }

      while (activeJobs.length < MAX_CONCURRENT_UPLOADS && queue.length > 0) {
        const job = queue.shift()!;
        activeJobs.push(job);
        updateJobStatus(job.id, "uploading");

        processJob(job).then((success) => {
          if (success) {
            results.success++;
          } else {
            results.errors++;
          }
          const index = activeJobs.findIndex((j) => j.id === job.id);
          if (index > -1) {
            activeJobs.splice(index, 1);
          }
          processNext();
        });
      }
    };

    await processNext();
  };

  const processJob = async (job: UploadJob): Promise<boolean> => {
    try {
      // Validate file
      if (!ALLOWED_FILE_TYPES.includes(job.file.type)) {
        updateJobError(job.id, "Chỉ chấp nhận file PDF");
        return false;
      }

      if (job.file.size > MAX_FILE_SIZE) {
        updateJobError(job.id, "File vượt quá 10MB");
        return false;
      }

      // Validate required fields
      if (!job.fullName.trim()) {
        updateJobError(job.id, "Họ và tên là bắt buộc");
        return false;
      }

      // Lấy thông tin user
      const { data: userData, error: userError } =
        await supabase.auth.getUser();
      if (userError || !userData?.user) {
        updateJobError(job.id, "Bạn chưa đăng nhập");
        return false;
      }

      const user = userData.user;
      const path = `${user.id}/${Date.now()}_${job.file.name}`;

      // Upload file với progress tracking
      const { error: uploadError } = await supabase.storage
        .from("resumes")
        .upload(path, job.file, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) {
        updateJobError(job.id, `Upload thất bại: ${uploadError.message}`);
        return false;
      }

      updateJobProgress(job.id, 50);

      // Lấy public URL
      const { data: publicData } = supabase.storage
        .from("resumes")
        .getPublicUrl(path);

      const publicUrl = publicData.publicUrl;
      if (!publicUrl) {
        updateJobError(job.id, "Không tạo được public URL");
        return false;
      }

      updateJobProgress(job.id, 75);

      // Lấy access token
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      if (!token) {
        updateJobError(job.id, "Không lấy được access token");
        return false;
      }

      // Gọi Edge Function
      const edgeBase = import.meta.env.VITE_EDGE_FUNCTION_BASE;
      if (!edgeBase) {
        updateJobError(job.id, "Thiếu biến môi trường");
        return false;
      }

      // Chuẩn bị data cho Edge Function
      const requestBody = {
        full_name: job.fullName.trim(),
        applied_position: job.appliedPosition.trim(),
        status: "New",
        resume_url: publicUrl,
        skills: job.skills,
      };

      console.log(token);
      debugger;

      console.log("Sending request to Edge Function:", requestBody);

      const res = await fetch(`${edgeBase}/create-candidate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (!res.ok) {
        const responseData = await res.json();
        updateJobError(
          job.id,
          `Lỗi tạo hồ sơ: ${responseData.error || res.statusText}`
        );
        return false;
      }

      const responseData = await res.json();
      console.log("Edge Function response:", responseData);

      updateJobProgress(job.id, 100);
      updateJobStatus(job.id, "completed");
      return true;
    } catch (err: any) {
      updateJobError(job.id, err.message || "Lỗi không xác định");
      return false;
    }
  };

  // Helper functions để update job state
  const updateJobProgress = (jobId: string, progress: number) => {
    setUploadJobs((prev) =>
      prev.map((job) => (job.id === jobId ? { ...job, progress } : job))
    );
  };

  const updateJobStatus = (jobId: string, status: UploadJob["status"]) => {
    setUploadJobs((prev) =>
      prev.map((job) => (job.id === jobId ? { ...job, status } : job))
    );
  };

  const updateJobError = (jobId: string, error: string) => {
    setUploadJobs((prev) =>
      prev.map((job) =>
        job.id === jobId ? { ...job, status: "error", error } : job
      )
    );
  };

  const removeJob = (jobId: string) => {
    setUploadJobs((prev) => prev.filter((job) => job.id !== jobId));
  };

  const handleSubmit = async (values: any) => {
    if (uploadJobs.length === 0) {
      message.warning("Vui lòng thêm ít nhất một file CV");
      return;
    }

    // Validate all jobs have required fields
    const invalidJobs = uploadJobs.filter((job) => !job.fullName.trim());
    if (invalidJobs.length > 0) {
      message.error("Vui lòng nhập họ và tên cho tất cả các hồ sơ");
      return;
    }

    setLoading(true);
    await processUploadQueue(uploadJobs);
  };

  const handleFileUpload = (file: File) => {
    const job: UploadJob = {
      id: Math.random().toString(36).substr(2, 9),
      file,
      fullName: "",
      appliedPosition: "",
      skills: [],
      progress: 0,
      status: "pending",
    };

    setUploadJobs((prev) => [...prev, job]);
    return false; // Prevent default upload behavior
  };

  const handleSkillsChange = (jobId: string, skills: string[]) => {
    setUploadJobs((prev) =>
      prev.map((job) => (job.id === jobId ? { ...job, skills } : job))
    );
  };

  const getStatusColor = (status: UploadJob["status"]) => {
    switch (status) {
      case "completed":
        return "success";
      case "uploading":
        return "processing";
      case "error":
        return "error";
      default:
        return "default";
    }
  };

  const getStatusText = (status: UploadJob["status"]) => {
    switch (status) {
      case "completed":
        return "Thành công";
      case "uploading":
        return "Đang xử lý";
      case "error":
        return "Lỗi";
      default:
        return "Chờ xử lý";
    }
  };

  const renderSkillsTags = (skills: string[]) => {
    return (
      <Space size={[0, 4]} wrap>
        {skills.map((skill, index) => (
          <Tag key={index} color="blue">
            {skill}
          </Tag>
        ))}
      </Space>
    );
  };

  return (
    <Card
      title={
        <Space>
          <UserOutlined />
          <span>Thêm hồ sơ ứng viên</span>
        </Space>
      }
      style={{ maxWidth: 800, margin: "20px auto" }}
      extra={
        <Button icon={<PlusOutlined />} onClick={() => setIsModalVisible(true)}>
          Thêm file ({uploadJobs.length})
        </Button>
      }
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        disabled={loading}
      >
        {/* Danh sách file đã thêm */}
        {uploadJobs.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <Text strong>Danh sách file đã thêm ({uploadJobs.length}):</Text>
            <List
              size="small"
              dataSource={uploadJobs}
              renderItem={(job) => (
                <List.Item
                  actions={[
                    job.status === "pending" && (
                      <Button
                        type="text"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => removeJob(job.id)}
                        size="small"
                      />
                    ),
                  ]}
                >
                  <List.Item.Meta
                    avatar={<PaperClipOutlined />}
                    title={
                      <Space>
                        <Text>{job.file.name}</Text>
                        <Tag color={getStatusColor(job.status)}>
                          {getStatusText(job.status)}
                        </Tag>
                      </Space>
                    }
                    description={
                      <div style={{ width: "100%" }}>
                        {job.status === "uploading" && (
                          <Progress
                            percent={job.progress}
                            size="small"
                            style={{ width: 200, marginBottom: 8 }}
                          />
                        )}
                        {job.status === "error" && (
                          <Text
                            type="danger"
                            style={{
                              fontSize: 12,
                              display: "block",
                              marginBottom: 8,
                            }}
                          >
                            {job.error}
                          </Text>
                        )}

                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 8,
                          }}
                        >
                          <Input
                            placeholder="Họ và tên *"
                            value={job.fullName}
                            onChange={(e) => {
                              setUploadJobs((prev) =>
                                prev.map((j) =>
                                  j.id === job.id
                                    ? { ...j, fullName: e.target.value }
                                    : j
                                )
                              );
                            }}
                            size="small"
                            status={!job.fullName.trim() ? "error" : ""}
                          />

                          <Select
                            placeholder="Chọn vị trí ứng tuyển"
                            value={job.appliedPosition || undefined}
                            onChange={(value) =>
                              setUploadJobs((prev) =>
                                prev.map((j) =>
                                  j.id === job.id
                                    ? { ...j, appliedPosition: value }
                                    : j
                                )
                              )
                            }
                            size="small"
                            style={{ width: "100%" }}
                          >
                            <Option value="Frontend Developer">
                              Frontend Developer
                            </Option>
                            <Option value="Backend Developer">
                              Backend Developer
                            </Option>
                            <Option value="Fullstack Developer">
                              Fullstack Developer
                            </Option>
                            <Option value="Mobile Developer">
                              Mobile Developer
                            </Option>
                            <Option value="Data Analyst">Data Analyst</Option>
                          </Select>

                          <div>
                            <div style={{ marginBottom: 4 }}>
                              <Text type="secondary" style={{ fontSize: 12 }}>
                                Kỹ năng:
                              </Text>
                            </div>
                            <Select
                              mode="tags"
                              style={{ width: "100%" }}
                              placeholder="Thêm kỹ năng (ví dụ: React, TypeScript)"
                              value={job.skills}
                              onChange={(value) =>
                                handleSkillsChange(job.id, value)
                              }
                              size="small"
                              tokenSeparators={[",", ";"]}
                              options={SKILLS_SUGGESTIONS.map((skill) => ({
                                value: skill,
                                label: skill,
                              }))}
                              maxTagCount={5}
                              onBlur={(e) => e.stopPropagation()} // Ngăn lỗi focus
                              dropdownRender={(menu) => (
                                <div onMouseDown={(e) => e.preventDefault()}>
                                  {menu}
                                </div>
                              )}
                            />
                            {job.skills.length > 0 && (
                              <div style={{ marginTop: 4 }}>
                                {renderSkillsTags(job.skills)}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    }
                  />
                </List.Item>
              )}
            />
          </div>
        )}

        <Form.Item>
          <Button
            type="primary"
            htmlType="submit"
            loading={loading}
            disabled={
              uploadJobs.length === 0 ||
              uploadJobs.some((job) => !job.fullName.trim())
            }
            block
            size="large"
          >
            {loading
              ? `Đang xử lý... (${
                  uploadJobs.filter((j) => j.status === "completed").length
                }/${uploadJobs.length})`
              : "Tạo hồ sơ ứng viên"}
          </Button>
        </Form.Item>

        <Alert
          message="Thông tin"
          description={
            <div>
              <div>
                • Bạn có thể upload tối đa {MAX_CONCURRENT_UPLOADS} file cùng
                lúc
              </div>
              <div>• Chỉ chấp nhận file PDF dưới 10MB</div>
              <div>
                • Nhập kỹ năng để hệ thống tính toán điểm phù hợp với vị trí
              </div>
            </div>
          }
          type="info"
          showIcon
        />
      </Form>

      {/* Modal thêm file */}
      <Modal
        title="Thêm file CV"
        open={isModalVisible}
        onCancel={() => setIsModalVisible(false)}
        footer={null}
        width={600}
      >
        <Dragger
          multiple
          accept=".pdf,application/pdf"
          beforeUpload={handleFileUpload}
          showUploadList={false}
          disabled={uploadJobs.length >= 10}
        >
          <p className="ant-upload-drag-icon">
            <UploadOutlined />
          </p>
          <p className="ant-upload-text">Click hoặc kéo thả file PDF vào đây</p>
          <p className="ant-upload-hint">
            Hỗ trợ upload nhiều file. Mỗi file tối đa 10MB.
          </p>
        </Dragger>

        {uploadJobs.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <Text strong>File đã chọn ({uploadJobs.length}/10):</Text>
            <List
              size="small"
              dataSource={uploadJobs}
              renderItem={(job) => (
                <List.Item
                  actions={[
                    <Button
                      type="text"
                      danger
                      icon={<CloseOutlined />}
                      onClick={() => removeJob(job.id)}
                      size="small"
                    />,
                  ]}
                >
                  <List.Item.Meta
                    avatar={<PaperClipOutlined />}
                    title={job.file.name}
                    description={`${(job.file.size / 1024 / 1024).toFixed(
                      2
                    )} MB`}
                  />
                </List.Item>
              )}
            />
          </div>
        )}
      </Modal>
    </Card>
  );
}
