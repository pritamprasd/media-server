import { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import mermaid from "mermaid";
import readme from "../../README.md?raw";
import "./About.css";

mermaid.initialize({ theme: "dark", startOnLoad: false });

function MermaidBlock({ code }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!ref.current || !code) return;
    mermaid
      .render(`mermaid-${Math.random().toString(36).slice(2)}`, code)
      .then(({ svg }) => {
        if (ref.current) ref.current.innerHTML = svg;
      })
      .catch(() => {
        if (ref.current) {
          ref.current.innerHTML = `<pre><code>${code}</code></pre>`;
        }
      });
  }, [code]);

  return <div className="about__mermaid" ref={ref} />;
}

function TableWrapper({ children }) {
  return (
    <div className="about__table-wrap">
      <table>{children}</table>
    </div>
  );
}

function About() {
  return (
    <div className="about">
      <div className="about__content">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            code({ className, children, ...props }) {
              const codeStr = String(children);
              const isMermaid = className === "language-mermaid";
              if (isMermaid) {
                return <MermaidBlock code={codeStr} />;
              }
              if (className || codeStr.includes("\n")) {
                return (
                  <pre className="about__pre">
                    <code className={className} {...props}>
                      {children}
                    </code>
                  </pre>
                );
              }
              return <code {...props}>{children}</code>;
            },
            pre({ children }) {
              return <>{children}</>;
            },
            table({ children }) {
              return <TableWrapper>{children}</TableWrapper>;
            },
          }}
        >
          {readme}
        </ReactMarkdown>
      </div>
    </div>
  );
}

export default About;
