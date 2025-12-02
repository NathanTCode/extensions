import {
  Action,
  ActionPanel,
  Clipboard,
  Detail,
  Form,
  getPreferenceValues,
  getSelectedFinderItems,
  Grid,
  showToast,
  Toast,
} from "@raycast/api";
import { useEffect, useState } from "react";
import fs from "fs";
import path from "path";

interface Preferences {
  replicateApiToken: string;
}

interface ReplicatePrediction {
  id: string;
  status: string;
  output?: string;
}

export default function Command() {
  const preferences = getPreferenceValues<Preferences>();
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [processedImage, setProcessedImage] = useState<string | null>(null);

  useEffect(() => {
    async function loadSelectedFile() {
      try {
        const selectedItems = await getSelectedFinderItems();
        if (selectedItems.length === 0) {
          return; // No toast, will show Form
        }
        const file = selectedItems[0];
        if (!file.path.match(/\.(png|jpg|jpeg)$/i)) {
          showToast({
            style: Toast.Style.Failure,
            title: "Invalid file type",
            message: "Please select a PNG or JPG image.",
          });
          return;
        }
        const imageData = fs.readFileSync(file.path);
        const base64 = imageData.toString("base64");
        const dataURL = `data:image/${path.extname(file.path).slice(1)};base64,${base64}`;
        setOriginalImage(dataURL);
        processImage(dataURL);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.toLowerCase().includes("finder") && message.toLowerCase().includes("frontmost")) {
          return; // Silently ignore Finder not frontmost error
        }
        showToast({ style: Toast.Style.Failure, title: "Error loading file", message });
      }
    }
    loadSelectedFile();
  }, []);

  async function processImage(imageDataURL: string) {
    try {
      const response = await fetch(`https://api.replicate.com/v1/models/bria/remove-background/predictions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${preferences.replicateApiToken}`,
          "Content-Type": "application/json",
          Prefer: "wait",
        },
        body: JSON.stringify({
          input: {
            image: imageDataURL,
            content_moderation: false,
            preserve_partial_alpha: true,
          },
        }),
      });
      const prediction = (await response.json()) as ReplicatePrediction;
      if (prediction.output) {
        setProcessedImage(prediction.output);
      } else {
        throw new Error("Processing failed");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      showToast({ style: Toast.Style.Failure, title: "Processing error", message });
    }
  }

  if (!originalImage) {
    return (
      <>
        <Detail markdown="# Remove Background\n\nSelect an image to remove its background." />
        <Form
          actions={
            <ActionPanel>
              <Action.SubmitForm
                title="Process Image"
                onSubmit={async (values: { file: string[] }) => {
                  const filePath = values.file[0];
                  if (!filePath) return;
                  if (!filePath.match(/\.(png|jpg|jpeg)$/i)) {
                    showToast({
                      style: Toast.Style.Failure,
                      title: "Invalid file type",
                      message: "Please select a PNG or JPG image.",
                    });
                    return;
                  }
                  try {
                    const imageData = fs.readFileSync(filePath);
                    const base64 = imageData.toString("base64");
                    const dataURL = `data:image/${path.extname(filePath).slice(1)};base64,${base64}`;
                    setOriginalImage(dataURL);
                    await processImage(dataURL);
                  } catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    showToast({ style: Toast.Style.Failure, title: "Error loading file", message });
                  }
                }}
              />
            </ActionPanel>
          }
        >
          <Form.FilePicker id="file" title="Select Image" allowMultipleSelection={false} />
        </Form>
      </>
    );
  }

  return (
    <Grid columns={2} aspectRatio="4/3">
      <Grid.Item title="Original" content={originalImage} />
      <Grid.Item
        title={processedImage ? "Processed" : "Processing..."}
        subtitle={processedImage ? undefined : "Please wait while the image is being processed."}
        content={processedImage || ""}
        actions={
          processedImage ? (
            <ActionPanel>
              <Action
                title="Copy Processed Image"
                onAction={async () => {
                  try {
                    const response = await fetch(processedImage);
                    const blob = await response.blob();
                    const arrayBuffer = await blob.arrayBuffer();
                    const buffer = Buffer.from(arrayBuffer);
                    const base64 = buffer.toString("base64");
                    const mimeType = response.headers.get("content-type") || "image/png";
                    const dataURL = `data:${mimeType};base64,${base64}`;
                    await Clipboard.copy(dataURL);
                  } catch (error) {
                    showToast({ style: Toast.Style.Failure, title: "Failed to copy image", message: String(error) });
                  }
                }}
                shortcut={{ modifiers: ["cmd"], key: "c" }}
              />
              <Action.CopyToClipboard title="Copy Processed Image URL" content={processedImage} />
              <Action.Paste title="Paste Processed Image URL" content={processedImage} />
              <Action.OpenInBrowser title="Open Processed Image in Browser" url={processedImage} />
            </ActionPanel>
          ) : undefined
        }
      />
    </Grid>
  );
}
