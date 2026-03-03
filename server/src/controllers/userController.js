import { uploadOnCloudinary } from "../config/cloudinary.js";
import User from "../models/userModel.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js"
import { validationStatus } from "./../utils/ValidationStatusCode.js";
import { AsyncHandler } from '../utils/Asynchandler.js'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { sendEmail } from "../utils/email.js";
import crypto from 'crypto'


const generateAccessAndRefreshTokens = async (userId) => {
  try {
    const user = await User.findById(userId);

    // generate tokens
    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    // save the refresh token in database
    user.refreshToken = refreshToken;

    // when saving the user than the password field is also activating and expect a password from user  so we pass
    //validateBeforeSave to false so it will not validate the user at this time

    await user.save({ validateBeforeSave: false });

    return {
      accessToken,
      refreshToken,
    };
  } catch (error) {
    throw new ApiError(
      validationStatus.internalError,
      "Something went wrong while generating  refresh and access user token"
    );
  }
};



const registerUser = AsyncHandler(async (req, res) => {
  const { fullname, email, password, role } = req.body;
  // 1️⃣ Validate required fields
  if (!fullname || !email || !password || !role) {
    return res.status(400).json({ message: "All required fields must be filled" });
  }
  // 2️⃣ Check if user already exists
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return res.status(400).json({ message: "Email is already registered" });
  }

  const profilePicPath = req.files?.profilePic?.[0]?.path;
  const coverImagePath = req.files?.coverPic?.[0]?.path;

  let profilePicUrl = "";
  let coverImageUrl = "";

  if (profilePicPath) {
    const uploadedProfile = await uploadOnCloudinary(profilePicPath);
    if (!uploadedProfile) {
      throw new ApiError(validationStatus.internalError, "Error uploading profile picture");
    }
    profilePicUrl = uploadedProfile?.url || "";
  }
  // Upload cover image
  if (coverImagePath) {
    const uploadedCover = await uploadOnCloudinary(coverImagePath);
    coverImageUrl = uploadedCover?.url || "";
  }

  // 3️⃣ Create user
  const newUser = await User.create({
    fullname,
    email,
    password, // hashed automatically
    role,
    profilePic: profilePicUrl,
    coverPic: coverImageUrl,
  });

  // 4️⃣ Fetch safe user object using .select() (exclude password & refreshToken)
  const safeUser = await User.findById(newUser._id).select(
    "-password -refreshToken"
  );

  if (!safeUser) {
    throw new ApiError(
      validationStatus.internalError,
      "Something went wrong while registering the user"
    );
  }

  // 5️⃣ Send response
  return res.status(validationStatus.created)
    .json(
      new ApiResponse(
        validationStatus.created,
        safeUser,
        'user created successfully '
      )
    );
}
)

const loginUser = AsyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    throw new ApiError(validationStatus.badRequest, "All required fields must be filled")
  }
  // check user already exists
  const user = await User.findOne({ email });
  if (!user) {
    throw new ApiError(validationStatus.notFound, "User does not exist")
  }
  // compare password
  const ispasswordValid = await user.isPasswordCorrect(password)
  if (!ispasswordValid) {
    throw new ApiError(validationStatus.unauthorized, 'invalid credentials ')
  }

  // Access and refresh token
  const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(
    user._id
  );
  // console.log("ACCESS TOKEN VALUE:", accessToken);
  // console.log("ACCESS TOKEN TYPE:", typeof accessToken);

  //  when we send information to user it has  unwanted fields, for example we do not send the
  // password to the user etc
  // we have already have reference of the user that is empty
  // so we have two options here :
  //     first is update user here
  //     second run anther query for database

  // we have to decide if this operation is expensive or not ?? what is  more suitable for action here

  const loggedInUser = await User.findById(user._id).select(
    "-password -refreshToken"
  ); // again find user and filter out some fields

  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
  };
  //  by default the cookies is modifies by anyone on frontend but by set these two attributes to true
  // then the cookies will only modifies from server

  return res
    .status(200)
    .cookie("accessToken", String(accessToken), options)
    .cookie("refreshToken", String(refreshToken), options)
    .json(
      new ApiResponse(
        validationStatus.ok,
        {
          user: loggedInUser,
          accessToken,
          refreshToken,
        },
        "User logged In successfully"
      )
    );

})

const logoutUser = AsyncHandler(async (req, res) => {
  const userId = req.user?._id

  if (!userId) {
    throw new ApiError(validationStatus.unauthorized, 'unauthorized access')
  }
  // Remove refreshToken from database
  await User.findByIdAndUpdate(
    userId,
    {
      $unset: { refreshToken: 1 }
    },
    { new: true }
  )
  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
  };
  return res
    .status(validationStatus.ok)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(
      new ApiResponse(
        validationStatus.ok,
        {},
        "User logged out successfully"

      )
    )
})

const refreshAccessToken = AsyncHandler(async (req, res) => {
  // 1️⃣ Get refresh token from cookies

  const incomingRefreshToken = req.cookies?.refreshToken || req.body?.refreshToken;
  if (!incomingRefreshToken) {
    throw new ApiError(validationStatus.unauthorized, "Refresh token not found")
  }
  try {
    const decodedToken = jwt.verify(
      incomingRefreshToken, process.env.REFRESH_TOKEN_SECRET
    );
    const user = await User.findById(decodedToken?._id)
    if (!user) {
      throw new ApiError(validationStatus.unauthorized, "invalid refresh token")
    }

    // 4️⃣ Compare refresh token with DB
    if (incomingRefreshToken !== user.refreshToken) {
      throw new ApiError(
        validationStatus.unauthorized, "refrsh token expired or already used"
      )
    }
    // generate new token 
    const newAccessToken = user.generateAccessToken();
    const newRefreshToken = user.generateRefreshToken();

    // save new refrshtoken in Db
    user.refreshToken = newRefreshToken
    await user.save({ validateBeforeSave: false });

    const options = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
    }
    // send new tokens
    return res
      .status(validationStatus.ok)
      .cookie("accessToken", newAccessToken, options)
      .cookie("refreshToken", newRefreshToken, options)
      .json(
        new ApiResponse(
          validationStatus.ok,
          {
            accessToken: newAccessToken,
            refreshToken: newRefreshToken,
          },
          "Access token refreshed successfully"
        )
      )
  } catch (error) {
    console.log("Refresh token error:", error.message); // <-- logs the real reason
    throw new ApiError(validationStatus.unauthorized, error.message || "invalid refresh token");
  }

})

const myProfile = AsyncHandler(async (req, res) => {
  // get userid from req in auth middleware
  const userId = req.user?._id
  if (!userId) {
    throw new ApiError(validationStatus.unauthorized, "Unauthorized access")
  }
  // 2️⃣ Fetch user and exclude sensitive fields
  const user = await User.findById(userId).select(" -password -refreshToken ")

  if (!user) {
    throw new ApiError(validationStatus.notFound, "user not found")
  }

  // send response
  return res
    .status(validationStatus.ok)
    .json(
      new ApiResponse(
        validationStatus.ok,
        user,
        'user fetched successfully'
      )
    )

})

const updateProfile = AsyncHandler(async (req, res) => {
  const userId = req.user?._id;

  const user = await User.findById(userId);
  if (!user) {
    throw new ApiError(validationStatus.unauthorized, "user not found")
  }
  // Update fields if they exist in request body
  const { fullname, email, password } = req.body;
  if (fullname) user.fullname = fullname;
  if (email) user.email = email;

  // Update password if provided
  if (password) {
    user.password = await bcrypt.hash(password, 10); // or rely on pre-save hook
  }


  // Update profile picture if provided
  if (req.files?.profilePic) {
    const profileUpload = await uploadOnCloudinary(req.files.profilePic[0].path);
    if (!profileUpload)
      throw new ApiError(validationStatus.internalError, "Error uploading profile picture");
  }
  // Update cover picture if provided
  if (req.files?.coverPic) {
    const coverUpload = await uploadOnCloudinary(req.files.coverPic[0].path);
    if (!coverUpload)
      throw new ApiError(validationStatus.internalError, "Error uploading cover picture");
  }
  // save updated user
  const updatedUser = await user.save();

  // Prepare safe response (remove sensitive fields)
  const safeUser = updatedUser.toObject();
  delete safeUser.password;
  delete safeUser.refreshToken;

  res.status(validationStatus.ok).json({
    success: true,
    message: "Profile updated successfully",
    user: safeUser,
  });


})

const forgotPassword = AsyncHandler(async (req, res) => {
  const { email } = req.body;
  if (!email) {
    throw new ApiError(validationStatus.badRequest, "email is required")
  }
  const user = await User.findOne({ email });
  if (!user) {
    return res.ApiResponse(
      validationStatus.ok,
      {}, "If account exists, OTP has been sent."
    )
  }

  const otp = user.generatePasswordResetOTP();
  await user.save({ validateBeforeSave: false })

  await sendEmail({
    to: user.email,
    subject: "Password Reset OTP - Brandly",
    html: `
      <h2>Password Reset OTP</h2>
      <h1>${otp}</h1>
      <p>This OTP expires in 10 minutes.</p>
    `,
  })

  return res.status(validationStatus.ok).json(
    new ApiResponse(
      validationStatus.ok,
      {},
      "If account exists, OTP has been sent."
    )
  );

})

const resetPassword = AsyncHandler(async (req, res) => {
  const { email, otp, password } = req.body;

  if (!email || !otp || !password) {
    throw new ApiError(
      validationStatus.badRequest,
      "Email ,password and otp is required"
    )
  }
  const user = await User.findOne({ email })

  if (!user) {
    throw new ApiError(validationStatus.badRequest, "Invalid request");
  }

  if (user.passwordResetExpires < Date.now()) {
    throw new ApiError(validationStatus.badRequest, "OTP expired");
  }

  if (user.passwordResetAttempts >= 5) {
    throw new ApiError(
      validationStatus.tooManyRequests,
      "Too many attempts. Request new OTP."
    );
  }

  const hashedOTP = crypto
    .createHash("sha256")
    .update(otp)
    .digest('hex');

  if (hashedOTP !== user.passwordResetOTP) {
    user.passwordResetAttempts += 1;
    await user.save({ validateBeforeSave: false });
    throw new ApiError(validationStatus.badRequest, "invalid OTP")
  }

  user.password = password;
  user.passwordResetOTP = undefined;
  user.passwordResetExpires = undefined;
  user.passwordResetAttempts = undefined;
  user.refreshToken = undefined;
  await user.save()
  return res.status(validationStatus.ok).json(
    new ApiResponse(validationStatus.ok,
      {},
      "password reset successfully")
  )
})

export {
  registerUser,
  loginUser,
  logoutUser,
  refreshAccessToken,
  myProfile,
  updateProfile,
  forgotPassword,
  resetPassword,
}
