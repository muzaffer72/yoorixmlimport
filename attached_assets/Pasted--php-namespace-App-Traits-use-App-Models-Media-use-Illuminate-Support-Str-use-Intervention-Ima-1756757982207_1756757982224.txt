<?php

namespace App\Traits;

use App\Models\Media;
use Illuminate\Support\Str;
use Intervention\Image\Facades\Image;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\File;

trait ImageTrait
{
    public function saveImage($requestImage, $for = '_product_', $save_to_db = false, $url = null, $token_id = null)
    {
        ini_set('memory_limit', '1024M');
        $extension = 'png';
        $mime_type = 'image/png';

        if ((!empty($requestImage) && $requestImage != 'null') || $url) :

            if (!$url) {
                $image = explode('.', $requestImage->getClientOriginalName());
                $extension = strtolower($requestImage->getClientOriginalExtension());
                $name = $image[0];
                $mime_type = $requestImage->getMimeType();
            }

            $storage = settingHelper('default_storage') != '' || settingHelper('default_storage') != null ? settingHelper('default_storage') : 'local';
            $response = false;

            $content_type = ['visibility' => 'public-read', 'ContentType' => $extension == 'svg' ? 'image/svg+xml' : $mime_type];
            $directory = 'images/';

            if ($for == 'favicon'):
                $directory = 'images/ico/';
                $image_sizes = [
                    '16x16', '32x32', '36x36', '48x48', '57x57', '60x60', '72x72', '76x76', '96x96', '114x114', '120x120', '128x128', '144x144', '152x152', '180x180', '192x192', '384x384', '512x512',
                    '640x1136', '750x1334', '1242x2208', '1125x2436', '828x1792', '1242x2688', '1536x2048', '1668x2224', '1668x2388', '2048x2732',
                ];
            elseif ($for == 'admin_light_logo' || $for == 'admin_dark_logo' || $for == 'footer_logo' || $for == 'invoice_logo' ||
                $for == 'light_logo' || $for == 'dark_logo' || $for == 'og_image' || $for == 'popup_image' ||
                $for == 'payment_method_banner' || $for == 'service_image' || $for == 'seller_logo' || $for == 'seller_banner'):

                if ($for == 'seller_logo' || $for == 'seller_banner'):
                    $directory = 'images/seller/';
                endif;

                if ($for == 'admin_light_logo' || $for == 'admin_dark_logo'):
                    $image_sizes = ['100x38'];
                elseif ($for == 'footer_logo'):
                    $image_sizes = ['89x33'];
                elseif ($for == 'light_logo' || $for == 'dark_logo'):
                    $image_sizes = ['138x52'];
                elseif ($for == 'invoice_logo'):
                    $image_sizes = ['118x45'];
                elseif ($for == 'payment_method_banner'):
                    $image_sizes = [];
                elseif ($for == 'seller_banner'):
                    $image_sizes = ['297x203'];
                elseif ($for == 'popup_image'):
                    $image_sizes = ['270x260'];
                elseif ($for == 'og_image'):
                    $image_sizes = ['1200x630'];
                endif;
                $image_sizes[] = '72x72';
            elseif ($for == '_staff_'):
                $image_sizes = ['128x128' , '40x40',];
            else:
                $image_sizes = ['40x40','72x72','190x230'];
            endif;
            File::ensureDirectoryExists('public/' . $directory, 0777);
            $originalImage = date('YmdHis') . "_original_" . $for. rand(1, 500) . '.' . $extension;
            $originalImageUrl = $directory . $originalImage;
            $images = $this->cropFiles([
                    'image' => $requestImage,
                    'directory' => $directory,
                    'extension' => $extension,
                    'image_sizes' => $image_sizes,
                    'for' => $for,
                    'original_image' => $originalImageUrl,
                ]);
            $requestImage->move('public/'.$directory, $originalImage);

            if ($for == 'favicon') {
                $images['originalImage_url'] = $originalImageUrl;
            } else {
                $images['storage'] = $storage;
                $images['original_image'] = $originalImageUrl;
            }

            $error = false;
            try {
                $size = File::size(public_path($originalImageUrl));
            } catch (\Exception $e) {
                $size = 0;
            }
            if ($storage == 'aws_s3' && array_key_exists('storage', $images)):
                $response = $this->uploadToS3($images, $content_type);
                if ($response === true):
                    $this->deleteImage($images);
                else:
                    $this->deleteImage($images);
                    $error = 's3_error';
                endif;
            endif;
            if ($storage == 'wasabi' && array_key_exists('storage', $images)):
                $response = $this->uploadToWasabi($images, $content_type);
                if ($response === true):
                    $this->deleteImage($images);
                else:
                    $this->deleteImage($images);
                    $error = 'wasabi_error';
                endif;
            endif;
            if ($save_to_db && !$error):

                $media = new Media();
                $media->name = @$name;
                $media->user_id = authUser() ? authId() : $token_id;
                $media->storage = ($response === true) ? $storage : 'local';
                $media->type = 'image';
                $media->extension = $extension;
                $media->size = $size;
                $media->original_file = $originalImageUrl;
                $media->image_variants = $images ?? [];
                $media->save();
            endif;

            if ($error === 's3_error'):
                return $error;
            endif;

            $data['images'] = $images;
            $data['id'] = isset($media) ? $media->id : null;

            return $data;
        else:
            return false;
        endif;
    }


    public function saveSvg($requestImage, $for = '_svg_', $save_to_db = false, $url = null, $token_id = null)
    {
        ini_set('memory_limit', '1024M');

        $extension = strtolower($requestImage->getClientOriginalExtension());
        $mime_type = $requestImage->getMimeType();

        if ($extension !== 'svg' || $mime_type !== 'image/svg+xml') {
            return false; // not SVG
        }

        $name = pathinfo($requestImage->getClientOriginalName(), PATHINFO_FILENAME);
        $storage = settingHelper('default_storage') ?: 'local';
        $directory = 'images/svg/';

        File::ensureDirectoryExists(public_path($directory), 0777);

        $fileName = date('YmdHis') . "_original_" . $for . rand(1, 500) . '.' . $extension;
        $filePath = $directory . $fileName;

        // Move the uploaded SVG file to the directory
        $requestImage->move(public_path($directory), $fileName);

        // File size
        try {
            $size = File::size(public_path($filePath));
        } catch (\Exception $e) {
            $size = 0;
        }

        $images = [
            'original_image' => $filePath,
            'storage' => $storage,
        ];

        $error = false;
        $response = false;

        // Upload to S3 or Wasabi if needed
        $content_type = ['visibility' => 'public-read', 'ContentType' => 'image/svg+xml'];
        if ($storage === 'aws_s3') {
            $response = $this->uploadToS3($images, $content_type);
            if ($response === true) {
                $this->deleteImage($images);
            } else {
                $this->deleteImage($images);
                $error = 's3_error';
            }
        } elseif ($storage === 'wasabi') {
            $response = $this->uploadToWasabi($images, $content_type);
            if ($response === true) {
                $this->deleteImage($images);
            } else {
                $this->deleteImage($images);
                $error = 'wasabi_error';
            }
        }

        if ($save_to_db && !$error) {
            $media = new Media();
            $media->name = $name;
            $media->user_id = authUser() ? authId() : $token_id;
            $media->storage = ($response === true) ? $storage : 'local';
            $media->type = 'image';
            $media->extension = $extension;
            $media->size = $size;
            $media->original_file = $filePath;
            $media->image_variants = $images;
            $media->save();
        }

        if ($error === 's3_error') {
            return $error;
        }

        return [
            'images' => $images,
            'id' => isset($media) ? $media->id : null,
        ];
    }



    public function deleteImage($files, $storage = 'local')
    {
        try {
            foreach (array_slice($files, 1) as $file):
                if ($storage == 'aws_s3'):
                    Storage::disk('s3')->delete($file);
                elseif ($storage == 'wasabi'):
                    Storage::disk('wasabi')->delete($file);
                else:
                    File::delete('public/' . $file);
                endif;
            endforeach;
            return true;
        } catch (\Exception $e) {
            return false;
        }
    }

    public function deleteSingleFile($file, $image_to_be_deleted = null, $storage = 'local'): bool
    {
        try {
            if (is_array($file)) {
                if (!$image_to_be_deleted) {
                    return false;
                }
                $storage = $file['storage'];
                $file = $file[$image_to_be_deleted];
            }
            if ($storage == 'aws_s3'):
                Storage::disk('s3')->delete($file);
            elseif ($storage == 'wasabi'):
                Storage::disk('wasabi')->delete($file);
            else:
                File::delete('public/' . $file);
            endif;
            return true;
        } catch (\Exception $e) {
            return false;
        }
    }


    public function saveFile($requested_file, $type, $save_to_db = true)
    {
        if (!empty($requested_file) && $requested_file != 'null') :
            $image = explode('.', $requested_file->getClientOriginalName());
            $extension = $requested_file->getClientOriginalExtension();
            $name = $image[0];
            $size = $requested_file->getSize();
            $storage = settingHelper('default_storage') != '' || settingHelper('default_storage') != null ? settingHelper('default_storage') : 'local';
            $response = false;
            $mime_type = $requested_file->getMimeType();
            $content_type = ['visibility' => 'public', 'ContentType' => $extension == 'svg' ? 'image/svg+xml' : $mime_type];
            $originalFile = date('YmdHis') . "_original_" . rand(1, 500) . '.' . $extension;
            $directory = 'files/';

            File::ensureDirectoryExists('public/' . $directory, 0777, true);

            $originalFileUrl = $directory . $originalFile;

            $requested_file->move('public/' . $directory, 'public/' . $originalFileUrl);

            if ($storage == 'aws_s3'):
                $response = $this->uploadFileToS3($originalFileUrl, $content_type);

                if ($response == true):
                    $this->deleteFile('public/' . $originalFileUrl);
                else:
                    $this->deleteFile('public/' . $originalFileUrl);
                    return 's3_error';
                endif;

            elseif ($storage == 'wasabi'):
                $response = $this->uploadFileToWasabi($originalFileUrl, $content_type);

                if ($response == true):
                    $this->deleteFile('public/' . $originalFileUrl);
                else:
                    $this->deleteFile('public/' . $originalFileUrl);
                    return 'wasabi_error';
                endif;
            endif;

            if ($save_to_db):
                $media = new Media();
                $media->name = $name;
                $media->user_id = authId();
                $media->storage = ($response == true) ? $storage : 'local';
                $media->type = $type;
                $media->extension = $extension;
                $media->size = $size;
                $media->original_file = $originalFileUrl;
                $media->image_variants = [];
                $media->save();
            endif;


            if ($type == 'pos_file'):
                return ['storage' => $storage, 'image' => $originalFileUrl];
            endif;
            return $originalFileUrl;
        else:
            return false;
        endif;
    }

    public function deleteFile($file, $storage = 'local')
    {
        try {
            if ($storage == 'aws_s3'):
                Storage::disk('s3')->delete($file);
            elseif ($storage == 'wasabi'):
                Storage::disk('wasabi')->delete($file);
            else:
                File::delete('public/' . $file);
            endif;

            return true;
        } catch (\Exception $e) {
            return false;
        }
    }

    public function getImage($id)
    {
        $image = Media::find($id);
        if (!blank($image)):
            $data = $image->image_variants;
            return $data;
        else:
            return false;
        endif;
    }

    public function getFile($id)
    {
        $file = Media::find($id);
        $data['storage'] = $file->storage;
        $data['file_type'] = $file->type;
        $data['file'] = $file->original_file;
        return $data;
    }

    public function getAllType($id)
    {
        $file = Media::find($id);
        if ($file):
            if ($file->type != 'image'):
                $data['storage'] = $file->storage;
                $data['file_type'] = $file->type;
                $data['original_file'] = $file->original_file;
            else:
                $data = array_merge($file->image_variants, ['file_type' => 'image']);
            endif;
            return $data;
        else:
            return false;
        endif;
    }

    protected function uploadToS3($files)
    {
        foreach (array_slice($files, 1) as $file):
            if ($file != "" && file_exists('public/' . $file)):
                Storage::disk('s3')->put($file, file_get_contents('public/' . $file));
            endif;
        endforeach;
        return true;
    }

    protected function uploadFileToS3($file, $contentType)
    {
        if ($file != "" && file_exists('public/' . $file)):
            Storage::disk('s3')->put($file, file_get_contents('public/' . $file), $contentType);
            return true;
        endif;
        return false;
    }

    protected function uploadToWasabi($files, $contentType)
    {
        foreach (array_slice($files, 1) as $file):
            if ($file != "" && file_exists('public/' . $file)):
                Storage::disk('wasabi')->put($file, file_get_contents('public/' . $file), $contentType);
            endif;
        endforeach;
        return true;
    }

    protected function uploadFileToWasabi($file, $contentType)
    {
        if ($file != "" && file_exists('public/' . $file)):
            Storage::disk('wasabi')->put($file, file_get_contents('public/' . $file), $contentType);
            return true;
        endif;
        return false;
    }

    public function getImageWithRecommendedSize($id, $width = 40, $height = 40, $slider = false, $avater = false)
    {
        $image = Media::find($id);
        if ($image && is_file_exists($image->original_file, $image->storage)):
            $image_size = 'image_' . $width . 'x' . $height;
            if (!array_key_exists($image_size, $image->image_variants) || !file_exists($image->image_variants[$image_size])):
                $directory = 'images/';
                $image_path =  $image->storage == 'local' ? public_path($image->original_file) : get_media($image->original_file, $image->storage);
                $images = $this->cropFiles([
                        'image' => $image_path,
                        'directory' => $directory,
                        'extension' => $image->extension,
                        'image_sizes' => [$width . 'x' . $height],
                        'original_image' => $image->original_file,
                    ]);
                $url = $images[$image_size];
                if ($image->storage == 'aws_s3'):
                    $content_type = ['visibility' => 'public', 'ContentType' => 'image/' . $image->extension];
                    $this->uploadFileToS3($url, $content_type);
                    $this->deleteFile($url, 'local');
                elseif ($image->storage == 'wasabi'):
                    $content_type = ['visibility' => 'public', 'ContentType' => 'image/' . $image->extension];
                    $this->uploadFileToWasabi($url, $content_type);
                    $this->deleteFile($url, 'local');
                endif;
                $image_variants = $image->image_variants;
                $image_variants[$image_size] = $url;
                $image->image_variants = $image_variants;
                $image->save();
            endif;
            return $image->image_variants;

        elseif ($avater):
            $directory = 'images/';

            $originalImage = date('YmdHis') . "-user-" . rand(1, 500) . '.'.$avater->getClientOriginalExtension();
            $imageProfileThumbnail = date('YmdHis') . "image_thumbnail-user-" . rand(1, 500) . '.'.$avater->getClientOriginalExtension();
            $image20X20 = date('YmdHis') . "image_20X20-user-" . rand(1, 500) . '.'.$avater->getClientOriginalExtension();
            $image40X40 = date('YmdHis') . "image_40X40-user-" . rand(1, 500) . '.'.$avater->getClientOriginalExtension();

            $originalImageUrl = $directory . $originalImage;
            $imageProfileThumbnailUrl = $directory . $imageProfileThumbnail;
            $image20X20Url = $directory . $image20X20;
            $image40X40Url = $directory . $image40X40;

            $storage = settingHelper('default_storage') == 'aws_s3' ? 'aws_s3' : 'local';
            $request_image = $avater;
            $request_image->move('public/images', $originalImageUrl);

            $images = $this->cropFiles($avater, $avater->getClientOriginalExtension(), [
                    '40,40' => $image40X40Url,
                    '130,130' => $imageProfileThumbnailUrl,
                    '20,20' => $image20X20Url,
                ]
            );

            $images['storage'] = $storage;
            $images['original_image'] = $originalImageUrl;

            $data['images'] = $images;
            $data['id'] = null;

            return $data;
        else:
            return [];
        endif;
    }

    public function getImageArrayRecommendedSize($id, $widths = [], $heights = [])
    {
        foreach ($widths as $key => $width):
            $height = $heights[$key];
            $this->getImageWithRecommendedSize($id, $width, $height);
        endforeach;
        $image = Media::find($id);
        if ($image):
            return $image->image_variants;
        else:
            return [];
        endif;
    }

    protected function getEncodePercentage(): int
    {
        if (settingHelper('image_optimization') && settingHelper('image_optimization') == 0):
            $encode_percentage = settingHelper('image_optimization_percentage') ?: 90;
        else:
            $encode_percentage = 90;
        endif;

        return $encode_percentage;
    }

    public function saveMultipleImage($images, $product): array
    {
        $storage = settingHelper('default_storage') != '' || settingHelper('default_storage') != null ? settingHelper('default_storage') : 'local';

        $description_images = [];
        if ($images && count($images) > 0) {
            if ($product && $product->description_images && count($product->description_images)) {
                foreach ($product->description_images as $description_image) {
                    $this->deleteFile($description_image['image'], $storage);
                }
            }
            foreach ($images as $description_image) {
                $image_name = Str::uuid() . '.' . $description_image->getClientOriginalExtension();
                $path = "images/description_images/$image_name";
                $description_image->move('public/images/description_images', $image_name);
                $description_images[] = [
                    'image' => $path,
                    'storage' => $storage,
                ];
            }
        }

        if (count($description_images) == 0 && $product && $product->description_images) {
            $description_images = $product->description_images;
        }
        return $description_images;
    }

    public function saveFont($requested_file)
    {
        if (!empty($requested_file) && $requested_file != 'null') :
            $image = explode('.', $requested_file->getClientOriginalName());
            $extension = $requested_file->getClientOriginalExtension();
            $name = $image[0];
            $size = $requested_file->getSize();
            $storage = settingHelper('default_storage') != '' || settingHelper('default_storage') != null ? settingHelper('default_storage') : 'local';
            $response = false;
            $mime_type = $requested_file->getMimeType();
            $content_type = ['visibility' => 'public', 'ContentType' => $extension == 'svg' ? 'image/svg+xml' : $mime_type];
            $originalFile = date('YmdHis') . "_original_" . rand(1, 500) . '.' . $extension;
            $directory = 'fonts/';

            File::ensureDirectoryExists('resources/' . $directory, 0777, true);

            $originalFileUrl = $originalFile;

            $requested_file->move('resources/' . $directory, 'resources/' . $originalFileUrl);

            if ($storage == 'aws_s3'):
                $response = $this->uploadFileToS3($originalFileUrl, $content_type);

                if ($response == true):
                    $this->deleteFile('resources/' . $originalFileUrl);
                else:
                    $this->deleteFile('resources/' . $originalFileUrl);
                    return 's3_error';
                endif;

            elseif ($storage == 'wasabi'):
                $response = $this->uploadFileToWasabi($originalFileUrl, $content_type);

                if ($response == true):
                    $this->deleteFile('resources/' . $originalFileUrl);
                else:
                    $this->deleteFile('resources/' . $originalFileUrl);
                    return 'wasabi_error';
                endif;
            endif;
            return ['storage' => $storage, 'file' => $originalFileUrl];

        else:
            return false;
        endif;
    }

    public function cropFiles($data): array
    {
        $requestImage   = $data['image'];
        $directory      = $data['directory'];
        $extension      = $data['extension'];
        $image_array    = $data['image_sizes'];
        $for            = getArrayValue('for', $data, '_media_');
        $original_image = getArrayValue('original_image', $data);

        $encode_percentage = $this->getEncodePercentage();
        $images = [];
        foreach ($image_array as $item) {
            $key = $for == 'favicon' ? "image_$item".'_url' : "image_$item";
            $image_path = $for == 'favicon' ? $directory .$for . "-$item.png" : $directory . date('YmdHis') . $item . $for . rand(1, 500) . '.' . $extension;
            if (addon_is_activated('ramdhani') && $extension == 'gif') {
                $images[$key] = $original_image;
                continue;
            }
            $images[$key] = $image_path;
            $size = explode('x',$item);
            Image::make($requestImage)->resize($size[0], $size[1],
                function ($constraint) {
                    $constraint->aspectRatio();
                })->save('public/' . $image_path, $encode_percentage, $extension);
        }
        return $images;
    }

    public function s3FileUploader($file)
    {
        $file_name = explode('/', $file);
        $file = end($file_name);
        $aws_access_key_idd = settingHelper('aws_access_key_id');
        $aws_secret_access_key = settingHelper('aws_secret_access_key');
        $s3_bucket = settingHelper('aws_bucket');
        $date = gmdate('D, d M Y H:i:sT');
        $http_method = 'PUT';
        $content_type = 'image/jpeg';
        $canonicalizedResource = "/{$s3_bucket}/{$file}";
        $string_to_sign = "{$http_method}\n\n{$content_type}\n{$date}\n{$canonicalizedResource}";
        $signature = base64_encode(hash_hmac('sha1', $string_to_sign, $aws_secret_access_key, true));
        $url = "https://{$s3_bucket}.s3.amazonaws.com/{$file}";
        $ch = curl_init();

        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_HEADER, false);
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $http_method);
        curl_setopt($ch, CURLOPT_POSTFIELDS, file_get_contents('public/images/'.$file));
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            "Host: {$s3_bucket}.s3.amazonaws.com",
            "Date: {$date}",
            "Content-Type: {$content_type}",
            "Authorization: AWS {$aws_access_key_idd}:{$signature}"
        ]);

        $response = curl_exec($ch);

        if ($response === false) {
            echo 'Error: ' . curl_error($ch);
        } else {
            echo 'Image uploaded successfully.';
        }

        curl_close($ch);
    }
}
