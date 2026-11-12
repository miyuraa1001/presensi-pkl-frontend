using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Collections.Generic;
using System.Runtime.InteropServices;

public class IconProcessor
{
    public static void Process(string inputPath, string outputCleanPath, string output192, string output512, string outputMaskable, string outputApple)
    {
        using (Bitmap srcBmp = (Bitmap)Image.FromFile(inputPath))
        {
            int w = srcBmp.Width;
            int h = srcBmp.Height;

            Bitmap cleanBmp = new Bitmap(w, h, PixelFormat.Format32bppArgb);
            using (Graphics g = Graphics.FromImage(cleanBmp))
            {
                g.DrawImage(srcBmp, 0, 0, w, h);
            }

            Rectangle rect = new Rectangle(0, 0, w, h);
            BitmapData data = cleanBmp.LockBits(rect, ImageLockMode.ReadWrite, PixelFormat.Format32bppArgb);
            int stride = data.Stride;
            byte[] bytes = new byte[stride * h];
            Marshal.Copy(data.Scan0, bytes, 0, bytes.Length);

            bool[] visited = new bool[w * h];
            Queue<int> queue = new Queue<int>();

            Func<int, int, bool> isDark = (x, y) =>
            {
                int idx = (y * stride) + (x * 4);
                byte b = bytes[idx];
                byte g = bytes[idx + 1];
                byte r = bytes[idx + 2];
                // Check if near black
                return (r <= 35 && g <= 35 && b <= 35);
            };

            int[] seeds = new int[] {
                0,
                w - 1,
                (h - 1) * w,
                (h - 1) * w + (w - 1)
            };

            foreach (int s in seeds)
            {
                int sx = s % w;
                int sy = s / w;
                if (isDark(sx, sy))
                {
                    queue.Enqueue(s);
                    visited[s] = true;
                }
            }

            int count = 0;
            while (queue.Count > 0)
            {
                int curr = queue.Dequeue();
                int cx = curr % w;
                int cy = curr / w;

                int cidx = (cy * stride) + (cx * 4);
                bytes[cidx + 3] = 0; // Transparent
                count++;

                int[] nx = new int[] { cx - 1, cx + 1, cx, cx };
                int[] ny = new int[] { cy, cy, cy - 1, cy + 1 };

                for (int i = 0; i < 4; i++)
                {
                    int x = nx[i];
                    int y = ny[i];
                    if (x >= 0 && x < w && y >= 0 && y < h)
                    {
                        int npos = y * w + x;
                        if (!visited[npos] && isDark(x, y))
                        {
                            visited[npos] = true;
                            queue.Enqueue(npos);
                        }
                    }
                }
            }

            Console.WriteLine("Made transparent: " + count + " pixels");

            Marshal.Copy(bytes, 0, data.Scan0, bytes.Length);
            cleanBmp.UnlockBits(data);

            cleanBmp.Save(outputCleanPath, ImageFormat.Png);

            // Generate 192x192 Any
            ResizeIcon(cleanBmp, 192, 192, output192);

            // Generate 512x512 Any
            ResizeIcon(cleanBmp, 512, 512, output512);

            // Generate Apple Touch Icon 180x180
            ResizeIcon(cleanBmp, 180, 180, outputApple);

            // Generate 512x512 Maskable
            // Maskable needs safe zone padding (card scaled to 82% = ~420px, on theme background)
            GenerateMaskable(cleanBmp, 512, outputMaskable);

            cleanBmp.Dispose();
        }
    }

    private static void ResizeIcon(Bitmap src, int width, int height, string outPath)
    {
        using (Bitmap dest = new Bitmap(width, height, PixelFormat.Format32bppArgb))
        {
            using (Graphics g = Graphics.FromImage(dest))
            {
                g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                g.SmoothingMode = SmoothingMode.HighQuality;
                g.PixelOffsetMode = PixelOffsetMode.HighQuality;
                g.Clear(Color.Transparent);
                g.DrawImage(src, 0, 0, width, height);
            }
            dest.Save(outPath, ImageFormat.Png);
        }
    }

    private static void GenerateMaskable(Bitmap src, int size, string outPath)
    {
        using (Bitmap dest = new Bitmap(size, size, PixelFormat.Format32bppArgb))
        {
            using (Graphics g = Graphics.FromImage(dest))
            {
                g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                g.SmoothingMode = SmoothingMode.HighQuality;
                g.PixelOffsetMode = PixelOffsetMode.HighQuality;

                // Android adaptive icon background: deep navy blue matching app theme (#08132b)
                // With subtle gradient to #0e2246 towards center for a rich premium look like Stockyard
                using (GraphicsPath path = new GraphicsPath())
                {
                    path.AddRectangle(new Rectangle(0, 0, size, size));
                    using (PathGradientBrush pgb = new PathGradientBrush(path))
                    {
                        pgb.CenterColor = Color.FromArgb(255, 14, 34, 70);
                        pgb.SurroundColors = new Color[] { Color.FromArgb(255, 8, 19, 43) };
                        g.FillRectangle(pgb, 0, 0, size, size);
                    }
                }

                // Place the cleaned logo card scaled within the 80% safe zone (diameter ~410px)
                // Size: 416 x 416, offset: (48, 48)
                int cardSize = 416;
                int offset = (size - cardSize) / 2;

                // Subtle shadow behind the card
                using (SolidBrush shadowBrush = new SolidBrush(Color.FromArgb(40, 0, 0, 0)))
                {
                    g.FillEllipse(shadowBrush, offset + 4, offset + 8, cardSize - 8, cardSize - 8);
                }

                g.DrawImage(src, offset, offset, cardSize, cardSize);
            }
            dest.Save(outPath, ImageFormat.Png);
        }
    }
}
