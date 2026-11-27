"use client";
import { useState, useEffect, useRef } from "react";
import NextLink from "next/link";
import { ArrowRight, ExternalLink, Link as LinkIcon, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface TimelineItem {
  id: number;
  title: string;
  date: string;
  content: string;
  category: string;
  icon: React.ElementType;
  relatedIds: number[];
  status: "completed" | "in-progress" | "pending";
  energy: number;
  /** Replaces the COMPLETE / IN PROGRESS / PENDING text on the card's badge. */
  statusLabel?: string;
  /** Short facts shown on the card, one per line (label on the left, value on the right). */
  details?: { label: string; value: string }[];
  /** Replaces the "Energy Level" bar: a labelled bar from 0 to 100. */
  meter?: { label: string; value: number; text?: string };
  /** A "View full" button on the card that opens this address. */
  href?: string;
  hrefLabel?: string;
}

interface RadialOrbitalTimelineProps {
  timelineData: TimelineItem[];
  /** Height of the whole area. The default fills the screen, as in the original. */
  className?: string;
  /** What sits in the middle of the orbit. The default is the glowing orb. */
  center?: React.ReactNode;
  /** Distance of the nodes from the centre, in pixels. */
  radius?: number;
  /** Called when "View full" is pressed, before the link is followed (use it to close a pop-up). */
  onNavigate?: (href: string) => void;
  /** "dark" is the original look (black stage); "light" sits on a light page with no background of its own. */
  theme?: "dark" | "light";
}

export default function RadialOrbitalTimeline({
  timelineData,
  className = "h-screen",
  center,
  radius = 200,
  onNavigate,
  theme = "dark",
}: RadialOrbitalTimelineProps) {
  const light = theme === "light";
  // Every colour that differs between the two looks, in one place.
  const th = light
    ? {
        root: "bg-transparent text-black",
        ring: "border border-black/30",
        glow: "rgba(0,0,0,0.12)",
        nodeOpen: "bg-black text-white",
        nodeRelated: "bg-black/15 text-black",
        nodeIdle: "bg-white text-black",
        borderOpen: "border-black shadow-lg shadow-black/20",
        borderRelated: "border-black animate-pulse",
        borderIdle: "border-black/50 shadow-sm",
        focus: "focus-visible:ring-black",
        labelOpen: "text-black",
        labelIdle: "text-black/90",
        card: "bg-white border-black/30 text-black shadow-xl shadow-black/15",
        stem: "bg-black/30",
        faint: "text-black/70",
        body: "text-black/80",
        strong: "text-black",
        muted: "text-black/75",
        divider: "border-black/10",
        track: "bg-black/10",
        related: "border-black/20 bg-transparent hover:bg-black/5 text-black/70 hover:text-black",
        action: "bg-black text-white hover:bg-black/85",
        completed: "text-white bg-black border-black",
        progress: "text-black bg-white border-black",
        pending: "text-black/60 bg-black/5 border-black/20",
      }
    : {
        root: "bg-black",
        ring: "border border-white/10",
        glow: "rgba(255,255,255,0.2)",
        nodeOpen: "bg-white text-black",
        nodeRelated: "bg-white/50 text-black",
        nodeIdle: "bg-black text-white",
        borderOpen: "border-white shadow-lg shadow-white/30",
        borderRelated: "border-white animate-pulse",
        borderIdle: "border-white/40",
        focus: "focus-visible:ring-white",
        labelOpen: "text-white",
        labelIdle: "text-white/70",
        card: "bg-black/90 backdrop-blur-lg border-white/30 text-white shadow-xl shadow-white/10",
        stem: "bg-white/50",
        faint: "text-white/50",
        body: "text-white/80",
        strong: "text-white/90",
        muted: "text-white/70",
        divider: "border-white/10",
        track: "bg-white/10",
        related: "border-white/20 bg-transparent hover:bg-white/10 text-white/80 hover:text-white",
        action: "bg-white text-black hover:bg-white/90",
        completed: "text-white bg-black border-white",
        progress: "text-black bg-white border-black",
        pending: "text-white bg-black/40 border-white/50",
      };
  const [viewMode] = useState<"orbital">("orbital");
  const [rotationAngle, setRotationAngle] = useState<number>(0);
  const [autoRotate, setAutoRotate] = useState<boolean>(true);
  const [hoveredNodeId, setHoveredNodeId] = useState<number | null>(null);
  const [focusedNodeId, setFocusedNodeId] = useState<number | null>(null);
  const [centerOffset] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  const [activeNodeId, setActiveNodeId] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const orbitRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef<Record<number, HTMLDivElement | null>>({});

  const handleContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // A click on empty space (not on a node or a card) closes whatever is open and starts the orbit turning again.
    const target = e.target as Node;
    if (target === containerRef.current || target === orbitRef.current || (e.currentTarget === target)) {
      setActiveNodeId(null);
      setAutoRotate(true);
    }
  };

  const toggleItem = (id: number) => {
    const opening = activeNodeId !== id;
    setActiveNodeId(opening ? id : null);
    setAutoRotate(!opening);
    if (opening) centerViewOnNode(id);
  };

  // Moving between a node and its preview cancels the countdown. Every leave
  // gets a fresh five seconds; touch selections get the same timeout.
  useEffect(() => {
    if (autoRotate || hoveredNodeId !== null || focusedNodeId !== null) return;
    const timer = setTimeout(() => {
      setActiveNodeId(null);
      setAutoRotate(true);
    }, 5000);
    return () => clearTimeout(timer);
  }, [autoRotate, activeNodeId, hoveredNodeId, focusedNodeId]);

  useEffect(() => {
    let rotationTimer: ReturnType<typeof setInterval> | undefined;

    if (autoRotate && hoveredNodeId === null && focusedNodeId === null && viewMode === "orbital") {
      rotationTimer = setInterval(() => {
        setRotationAngle((prev) => {
          const newAngle = (prev + 0.3) % 360;
          return Number(newAngle.toFixed(3));
        });
      }, 50);
    }

    return () => {
      if (rotationTimer) {
        clearInterval(rotationTimer);
      }
    };
  }, [autoRotate, viewMode, hoveredNodeId, focusedNodeId]);

  const centerViewOnNode = (nodeId: number) => {
    if (viewMode !== "orbital" || !nodeRefs.current[nodeId]) return;

    const nodeIndex = timelineData.findIndex((item) => item.id === nodeId);
    const totalNodes = timelineData.length;
    const targetAngle = (nodeIndex / totalNodes) * 360;

    setRotationAngle(270 - targetAngle);
  };

  const calculateNodePosition = (index: number, total: number) => {
    const angle = ((index / total) * 360 + rotationAngle) % 360;
    const radian = (angle * Math.PI) / 180;

    const x = radius * Math.cos(radian) + centerOffset.x;
    const y = radius * Math.sin(radian) + centerOffset.y;

    const zIndex = Math.round(100 + 50 * Math.cos(radian));
    const opacity = light ? 1 : Math.max(
      0.4,
      Math.min(1, 0.4 + 0.6 * ((1 + Math.sin(radian)) / 2))
    );

    return { x, y, angle, zIndex, opacity };
  };

  const getRelatedItems = (itemId: number): number[] => {
    const currentItem = timelineData.find((item) => item.id === itemId);
    return currentItem ? currentItem.relatedIds : [];
  };

  const isRelatedToActive = (itemId: number): boolean => {
    if (!activeNodeId) return false;
    const relatedItems = getRelatedItems(activeNodeId);
    return relatedItems.includes(itemId);
  };

  const getStatusStyles = (status: TimelineItem["status"]): string => {
    switch (status) {
      case "completed":
        return th.completed;
      case "in-progress":
        return th.progress;
      default:
        return th.pending;
    }
  };

  return (
    <div
      className={`w-full flex flex-col items-center justify-center overflow-hidden ${th.root} ${className}`}
      ref={containerRef}
      onClick={handleContainerClick}
    >
      <div className="relative w-full max-w-4xl h-full flex items-center justify-center">
        <div
          className="absolute w-full h-full flex items-center justify-center"
          ref={orbitRef}
          style={{
            perspective: "1000px",
            transform: `translate(${centerOffset.x}px, ${centerOffset.y}px)`,
          }}
        >
          {center ?? (
            <div className="absolute w-16 h-16 rounded-full bg-gradient-to-br from-purple-500 via-blue-500 to-teal-500 animate-pulse flex items-center justify-center z-10">
              <div className="absolute w-20 h-20 rounded-full border border-white/20 animate-ping opacity-70"></div>
              <div
                className="absolute w-24 h-24 rounded-full border border-white/10 animate-ping opacity-50"
                style={{ animationDelay: "0.5s" }}
              ></div>
              <div className="w-8 h-8 rounded-full bg-white/80 backdrop-blur-md"></div>
            </div>
          )}

          <div
            className={`absolute rounded-full ${th.ring}`}
            style={{ width: radius * 2, height: radius * 2 }}
          ></div>

          {timelineData.map((item, index) => {
            const position = calculateNodePosition(index, timelineData.length);
            const isExpanded = activeNodeId === item.id;
            const isHighlighted = isExpanded || hoveredNodeId === item.id;
            const isRelated = isRelatedToActive(item.id);
            const isPulsing = isRelated;
            const Icon = item.icon;

            const nodeStyle = {
              left: "50%",
              top: "50%",
              transform: `translate(${position.x}px, ${position.y}px) translate(-50%, -50%)`,
              zIndex: isExpanded ? 200 : position.zIndex,
              opacity: isExpanded ? 1 : position.opacity,
            };

            return (
              <div
                key={item.id}
                ref={(el) => {
                  nodeRefs.current[item.id] = el;
                }}
                className="absolute transition-all duration-700 cursor-pointer"
                style={nodeStyle}
                onPointerEnter={(event) => {
                  if (event.pointerType === "touch") return;
                  setHoveredNodeId(item.id);
                  setAutoRotate(false);
                }}
                onPointerLeave={(event) => {
                  if (event.pointerType !== "touch") setHoveredNodeId(null);
                }}
                onFocusCapture={(event) => {
                  if (event.target.matches(":focus-visible")) {
                    setFocusedNodeId(item.id);
                    setAutoRotate(false);
                  }
                }}
                onBlurCapture={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget)) setFocusedNodeId(null);
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleItem(item.id);
                }}
              >
                <div
                  className={`absolute rounded-full -inset-1 ${
                    isPulsing ? "animate-pulse duration-1000" : ""
                  }`}
                  style={{
                    background: `radial-gradient(circle, ${th.glow} 0%, rgba(255,255,255,0) 70%)`,
                    width: `${item.energy * 0.5 + 40}px`,
                    height: `${item.energy * 0.5 + 40}px`,
                    left: `-${(item.energy * 0.5 + 40 - 40) / 2}px`,
                    top: `-${(item.energy * 0.5 + 40 - 40) / 2}px`,
                  }}
                ></div>

                <button
                  type="button"
                  aria-label={item.title}
                  aria-expanded={!!isExpanded}
                  className={`
                  relative w-10 h-10 rounded-full flex items-center justify-center
                  ${
                    isHighlighted
                      ? th.nodeOpen
                      : isRelated
                      ? th.nodeRelated
                      : th.nodeIdle
                  }
                  border-2
                  ${
                    isHighlighted
                      ? th.borderOpen
                      : isRelated
                      ? th.borderRelated
                      : th.borderIdle
                  }
                  transition-all duration-300 transform outline-none focus-visible:ring-2 ${th.focus}
                `}
                >
                  <Icon size={16} />
                </button>

                <div
                  className={`
                  absolute top-12 left-1/2 -translate-x-1/2 whitespace-nowrap
                  text-xs font-semibold tracking-wider
                  transition-all duration-300
                  ${isHighlighted ? th.labelOpen : th.labelIdle}
                `}
                >
                  {item.title}
                </div>

                {isExpanded && (
                  <Card
                    className={`absolute top-20 left-1/2 -translate-x-1/2 w-64 gap-0 py-0 overflow-visible cursor-default ${th.card}`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className={`absolute -top-3 left-1/2 -translate-x-1/2 w-px h-3 ${th.stem}`}></div>
                    <CardHeader className="pb-2 pt-4">
                      <div className="flex justify-between items-center">
                        <Badge
                          className={`px-2 text-xs ${getStatusStyles(
                            item.status
                          )}`}
                        >
                          {item.statusLabel ??
                            (item.status === "completed"
                              ? "COMPLETE"
                              : item.status === "in-progress"
                              ? "IN PROGRESS"
                              : "PENDING")}
                        </Badge>
                        <span className={`text-xs font-mono ${th.faint}`}>
                          {item.date}
                        </span>
                      </div>
                      <CardTitle className="text-sm mt-2">
                        {item.title}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className={`text-xs pb-4 ${th.body}`}>
                      <p>{item.content}</p>

                      {item.details && item.details.length > 0 && (
                        <dl className="mt-3 grid gap-1">
                          {item.details.map((d) => (
                            <div
                              key={d.label}
                              className="flex items-start justify-between gap-3"
                            >
                              <dt className={th.faint}>{d.label}</dt>
                              <dd className={`text-right font-medium break-words ${th.strong}`}>
                                {d.value}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      )}

                      {item.meter ? (
                        <div className={`mt-4 pt-3 border-t ${th.divider}`}>
                          <div className="flex justify-between items-center text-xs mb-1">
                            <span className="flex items-center">
                              <Zap size={10} className="mr-1" />
                              {item.meter.label}
                            </span>
                            <span className="font-mono">
                              {item.meter.text ?? `${item.meter.value}%`}
                            </span>
                          </div>
                          <div className={`w-full h-1 rounded-full overflow-hidden ${th.track}`}>
                            <div
                              className="h-full bg-gradient-to-r from-blue-500 to-purple-500"
                              style={{
                                width: `${Math.max(0, Math.min(100, item.meter.value))}%`,
                              }}
                            ></div>
                          </div>
                        </div>
                      ) : !item.details ? (
                        <div className={`mt-4 pt-3 border-t ${th.divider}`}>
                          <div className="flex justify-between items-center text-xs mb-1">
                            <span className="flex items-center">
                              <Zap size={10} className="mr-1" />
                              Energy Level
                            </span>
                            <span className="font-mono">{item.energy}%</span>
                          </div>
                          <div className={`w-full h-1 rounded-full overflow-hidden ${th.track}`}>
                            <div
                              className="h-full bg-gradient-to-r from-blue-500 to-purple-500"
                              style={{ width: `${item.energy}%` }}
                            ></div>
                          </div>
                        </div>
                      ) : null}

                      {item.href && (
                        <Button
                          asChild
                          size="sm"
                          className={`mt-4 w-full h-8 ${th.action}`}
                        >
                          <NextLink
                            href={item.href}
                            onClick={() => onNavigate?.(item.href as string)}
                          >
                            {item.hrefLabel ?? "View full"}
                            <ExternalLink size={12} className="ml-1.5" />
                          </NextLink>
                        </Button>
                      )}

                      {item.relatedIds.length > 0 && (
                        <div className={`mt-4 pt-3 border-t ${th.divider}`}>
                          <div className="flex items-center mb-2">
                            <LinkIcon size={10} className={`mr-1 ${th.muted}`} />
                            <h4 className={`text-xs uppercase tracking-wider font-medium ${th.muted}`}>
                              Connected Nodes
                            </h4>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {item.relatedIds.map((relatedId) => {
                              const relatedItem = timelineData.find(
                                (i) => i.id === relatedId
                              );
                              return (
                                <Button
                                  key={relatedId}
                                  variant="outline"
                                  size="sm"
                                  className={`flex items-center h-6 px-2 py-0 text-xs rounded-none transition-all ${th.related}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleItem(relatedId);
                                  }}
                                >
                                  {relatedItem?.title}
                                  <ArrowRight size={8} className="ml-1 opacity-60" />
                                </Button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
