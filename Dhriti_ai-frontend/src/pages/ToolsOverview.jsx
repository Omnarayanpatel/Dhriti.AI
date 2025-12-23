import React from "react";
import { Link } from "react-router-dom";
import Sidebar from "../components/Sidebar";

// lucide icons
import { Type, Image, Video, Mic, LayoutTemplate } from "lucide-react";

function ToolsOverview() {
  const tools = [
    {
      title: "Text Annotation",
      desc: "Tag, highlight and classify text for NLP datasets.",
      link: "/tools/text-annotator",
      icon: <Type size={32} />,
      color: "from-purple-500 to-pink-500",
    },
    {
      title: "Image Annotation",
      desc: "Draw bounding boxes and labels for computer vision.",
      link: "/tools/image-annotator",
      icon: <Image size={32} />,
      color: "from-blue-500 to-cyan-500",
    },
    {
      title: "Video Annotation",
      desc: "Mark objects and actions frame-by-frame.",
      link: "/tools/video-annotator",
      icon: <Video size={32} />,
      color: "from-orange-500 to-red-500",
    },
    /* {
      title: "Audio / Sound Check",
      desc: "Transcribe & analyze audio + detect acoustic events.",
      link: "/tools/audio-check",
      icon: <Mic size={32} />,
      color: "from-green-500 to-lime-500",
    }, */

    // 🔥 NEW TEMPLATE BUILDER TOOL
    {
      title: "Template Builder",
      desc: "Create and manage annotation templates for projects.",
      link: "/tools/template-builder",
      icon: <LayoutTemplate size={32} />,
      color: "from-indigo-500 to-purple-600",
    },
  ];

  return (
    <div className="flex">
      <Sidebar />

      <div className="flex-1 p-10">
        <h1 className="text-4xl font-bold mb-2 text-purple-700">
          Welcome to Annotation Workspace ✨
        </h1>

        <p className="text-gray-600 text-lg mb-10">
          Choose a tool to get started. You can annotate text, images, videos,
          audio, and manage templates for AI/ML dataset creation.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
          {tools.map((t, i) => (
            <Link
              key={i}
              to={t.link}
              className={`p-7 rounded-3xl shadow-lg bg-gradient-to-br ${t.color} text-white
              transform hover:-translate-y-2 hover:shadow-2xl transition-all duration-300`}
            >
              <div className="flex items-center gap-4 mb-4">
                <div className="bg-white/20 p-3 rounded-2xl">
                  {t.icon}
                </div>
                <h2 className="text-2xl font-semibold">{t.title}</h2>
              </div>

              <p className="opacity-90 text-[15px]">{t.desc}</p>

              <div className="mt-4 text-sm underline opacity-90 hover:opacity-100">
                Start Now →
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

export default ToolsOverview;