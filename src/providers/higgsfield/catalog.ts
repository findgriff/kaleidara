import type { ModelCapability } from "../../schemas/generation.js";

/**
 * Higgsfield model catalog.
 *
 * This is a *static* description of what the studio is willing to ask for. It
 * is intentionally not fetched at runtime: the widget needs a capability list
 * before any credential exists, and every field here also acts as an input
 * guard (an aspect ratio absent from a model's list is rejected locally rather
 * than becoming a paid 4xx).
 *
 * `submitPath` and `baseCredits` are deployment-tunable — see
 * `HF_MODEL_PATH_OVERRIDES` in `.env.example`. Confirm both against the
 * provider's current published API and pricing page for your account before
 * enabling billing; they are defaults, not guarantees.
 */

export interface HiggsfieldModel extends ModelCapability {
  /** Endpoint path, relative to `HF_API_BASE_URL`, that starts a job. */
  readonly submitPath: string;
  /** Credits added per second of generated video. Zero for image models. */
  readonly creditsPerSecond: number;
  /** Multiplier applied on top of base credits, keyed by resolution. */
  readonly resolutionMultipliers: Readonly<Record<string, number>>;
  /** Rough wall-clock expectation, used for the ETA shown in the widget. */
  readonly baseEtaSeconds: number;
  readonly etaSecondsPerSecondOfVideo: number;
  /** Provider payload field name carrying reference images, if supported. */
  readonly referenceField: string | null;
}

export const HIGGSFIELD_MODELS: readonly HiggsfieldModel[] = [
  {
    id: "soul",
    label: "Soul (image)",
    description:
      "General-purpose text-to-image model. Strong at photographic and editorial looks; the studio default for stills.",
    mediaType: "image",
    aspectRatios: ["1:1", "4:3", "3:4", "2:3", "16:9", "9:16"],
    resolutions: ["720p", "1080p", "1440p", "2160p"],
    durationsSeconds: [],
    maxReferenceUrls: 3,
    supportsNegativePrompt: true,
    supportsSeed: true,
    maxQuantity: 4,
    baseCredits: 1,
    isDefault: true,
    submitPath: "/v1/text2image/soul",
    creditsPerSecond: 0,
    resolutionMultipliers: { "720p": 1, "1080p": 1.5, "1440p": 2.5, "2160p": 4 },
    baseEtaSeconds: 25,
    etaSecondsPerSecondOfVideo: 0,
    referenceField: "image_reference",
  },
  {
    id: "soul-id",
    label: "Soul ID (image, character-consistent)",
    description:
      "Image model tuned for identity consistency across a set. Requires at least one reference URL to anchor the subject.",
    mediaType: "image",
    aspectRatios: ["1:1", "4:3", "3:4", "2:3", "16:9", "9:16"],
    resolutions: ["720p", "1080p", "1440p"],
    durationsSeconds: [],
    maxReferenceUrls: 4,
    supportsNegativePrompt: true,
    supportsSeed: true,
    maxQuantity: 4,
    baseCredits: 2,
    isDefault: false,
    submitPath: "/v1/text2image/soul-id",
    creditsPerSecond: 0,
    resolutionMultipliers: { "720p": 1, "1080p": 1.5, "1440p": 2.5 },
    baseEtaSeconds: 35,
    etaSecondsPerSecondOfVideo: 0,
    referenceField: "image_reference",
  },
  {
    id: "dop",
    label: "DoP (video, cinematic motion)",
    description:
      "Text-to-video model with camera-move control. The studio default for motion work.",
    mediaType: "video",
    aspectRatios: ["16:9", "9:16", "1:1"],
    resolutions: ["720p", "1080p"],
    durationsSeconds: [3, 5, 10],
    maxReferenceUrls: 2,
    supportsNegativePrompt: true,
    supportsSeed: true,
    maxQuantity: 2,
    baseCredits: 8,
    isDefault: true,
    submitPath: "/v1/text2video/dop",
    creditsPerSecond: 2,
    resolutionMultipliers: { "720p": 1, "1080p": 1.75 },
    baseEtaSeconds: 90,
    etaSecondsPerSecondOfVideo: 12,
    referenceField: "input_images",
  },
  {
    id: "image2video",
    label: "Image to Video (animate a still)",
    description:
      "Animates one or more supplied stills. At least one reference URL is required.",
    mediaType: "video",
    aspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4"],
    resolutions: ["720p", "1080p"],
    durationsSeconds: [3, 5],
    maxReferenceUrls: 2,
    supportsNegativePrompt: true,
    supportsSeed: false,
    maxQuantity: 1,
    baseCredits: 6,
    isDefault: false,
    submitPath: "/v1/image2video",
    creditsPerSecond: 2,
    resolutionMultipliers: { "720p": 1, "1080p": 1.75 },
    baseEtaSeconds: 75,
    etaSecondsPerSecondOfVideo: 12,
    referenceField: "input_images",
  },
];

/** Models that cannot run without at least one reference URL. */
export const MODELS_REQUIRING_REFERENCE: ReadonlySet<string> = new Set(["soul-id", "image2video"]);

const BY_ID = new Map(HIGGSFIELD_MODELS.map((model) => [model.id, model]));

export function findHiggsfieldModel(modelId: string): HiggsfieldModel | undefined {
  return BY_ID.get(modelId);
}

export function defaultHiggsfieldModel(mediaType: "image" | "video"): HiggsfieldModel {
  const match = HIGGSFIELD_MODELS.find(
    (model) => model.mediaType === mediaType && model.isDefault
  );
  if (!match) {
    throw new Error(`Catalog has no default model for mediaType "${mediaType}".`);
  }
  return match;
}
